# WebSocket Service

This document describes the WebSocket interface exposed by the API service, how connections are managed, supported actions and events, error semantics, and guidance for cloud testing.

## Overview
- Endpoint (HTTP/1.1 upgrade): `GET /match-gateway/ws`
- Protocol: JSON over WebSocket
- Auth: JWT (HTTP layer). WebSocket route currently accepts messages that contain `userId`; a JWT handshake is planned and should replace that mechanism.
- Fan‑out: Redis pub/sub; each API task delivers messages to sockets it owns.

## Connection Lifecycle
1. Client opens a WebSocket to `/match-gateway/ws`.
2. Server issues a unique `connectionId` and stores a local mapping `{ connectionId → WebSocket }`.
3. When a client joins matchmaking, the server stores `connectionId` in Redis under `player:<userId>`.
4. On disconnect, local mappings are removed. Future cleanup tasks may remove Redis state for the player.

## Message Format
All client→server messages are JSON objects with at least an `action` field. `payload` is defined per action.

```
{
  "action": "join_matchmaking | select_asset | deselect_asset | ready_check | ping",
  "payload": { /* action-specific */ }
}
```

The server responds with JSON messages that include a `type` field and (for requests) a success/failure indicator.

## Actions
- `join_matchmaking`
  - Payload: `{ "userId": "<uuid>" }`
  - Side effects: adds player to Redis ZSET queue, registers `connectionId` in `player:<userId>`.
  - Response: `{ "type": "joined_queue", "playerAddedToQueue": true|false }`

- `select_asset`
  - Payload: `{ "payload": { "matchId": "<id>", "ticker": "AAPL", "userId": "<uuid>" } }`
  - Side effects: validates and persists selection; broadcasts an `asset_selection_update` to both players.
  - Response: `{ "type": "asset_selection_success", "matchId": "<id>", "ticker": "AAPL" }`

- `deselect_asset`
  - Payload: `{ "payload": { "matchId": "<id>", "ticker": "AAPL", "userId": "<uuid>" } }`
  - Side effects: removes selection; broadcasts `asset_deselection_update`.
  - Response: `{ "type": "asset_deselection_success", "matchId": "<id>", "ticker": "AAPL" }`

- `ready_check`
  - Payload: `{ "payload": { "matchId": "<id>", "userId": "<uuid>" } }`
  - Side effects: marks the player ready; if both ready, fetches prices, transitions to `in_progress`, and broadcasts `match_started`.
  - Response: none on success; broadcast events carry state.

- `ping`
  - Response: `{ "type": "pong", "message": "Server is alive" }`

## Broadcast Events
- `match_found` — sent to both players on match creation: `{ type, matchId, players, message, createdAt }`
- `asset_selection_update` — full `playerAssets` map for the match.
- `asset_deselection_update` — same shape as above.
- `ready_status_update` — lobby state with current `playerAssets` and status `asset_selection`.
- `match_started` — includes `matchStartedAt`, initial prices and shares, and the canonical `playerAssets`.

The broadcast payloads are designed as authoritative snapshots; clients should treat them as source of truth and render directly from the latest state.

## Error Semantics
- Malformed messages: `{ type: "error", message: "Failed to process request" }`
- Unknown action: `{ type: "error", message: "Unknown action" }`
- Server errors are logged with context (action, userId, matchId). The client receives a simple error message without internal details.

## Scaling & Delivery
- Each API task keeps its own in‑memory map of active sockets. Redis pub/sub is used to fan out messages across tasks. A published message includes a target `connectionId`; only the task that owns the socket delivers the frame.
- Because state delivery is idempotent (snapshots), out‑of‑order frames do not compromise client consistency.

## Security
- JWT must be enforced on the WebSocket handshake. Current implementation relies on the client providing `userId` in messages; move to a token‑based handshake (query param or header) and derive `userId` server‑side.
- All external calls (price provider) use server‑side credentials (Twelve Data key). No secrets are sent over the socket.

## Observability
- CloudWatch log group: `/ecs/<project>-backend-api-<env>`.
- Key log messages:
  - Server start: matchmaking initialization and Redis subscriber online
  - Connection open/close
  - Action handling (info) and validation errors (warn)
  - Price fetch failures (error)

## Next Steps for Cloud Testing
- ALB listener must be HTTP/1.1; if HTTPS is enabled, attach a valid certificate and forward to the API target group on port 3000. Clients use `wss://`.
- Confirm env vars via task definition or secrets injection: `AWS_REGION`, `WAGE_TABLE_NAME`, `REDIS_URL`, `JWT_SECRET`, `TWILIO_*`, `TWELVE_DATA_API_KEY`.
- Security groups:
  - ALB → API tasks: 3000/TCP
  - API tasks → Redis: 6379/TCP
  - Outbound from API tasks allowed
- Smoke tests:
  - `GET /health` via ALB → 200
  - WebSocket connection to `/match-gateway/ws`, send `join_matchmaking`, verify `joined_queue`
  - End‑to‑end: drive two clients through selection and ready → observe `match_started`
- Monitoring: watch the API log group for Redis connection success and initialization logs; no `@fastify/redis` timeouts should appear.
