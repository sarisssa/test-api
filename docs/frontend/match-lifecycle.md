# Frontend Integration: Match Lifecycle

This document summarises how matchmaking, lobby updates, and match start events flow through the WebSocket API.

## Connection Setup
1. Request a JWT via `/auth/verify-otp`.
2. Open a WebSocket to `ws://<api-host>/ws?token=<jwt>`.
3. The server replies immediately with `{ "ok": true, "type": "connected", "connectionId": "uuid" }`.
   - The `connectionId` is required internally for Redis bookkeeping; the client may store it for diagnostics but does not need to echo it.

If the token is missing or invalid, the socket is closed after the server sends `{ ok: false, error: 'missing_token' | 'invalid_token' }`.

## Client → Server Actions
All messages must be JSON objects with an `action` field. Optional `payload` content is listed below. The server’s immediate response always mirrors `action` and includes `ok: true | false`.

### `join_matchmaking`
- **Payload**: none.
- **Response**: `{ ok: true, action: 'join_matchmaking', playerAddedToQueue: boolean }`.
- The player is enqueued in Redis (`matchmaking:players:zset`) and a job is pushed for the matchmaking worker.
- On disconnect, the server automatically removes the player from the queue.

### `select_asset`
- **Payload**: `{ "matchId": "m123", "ticker": "AAPL" }`.
- **Response**: `{ ok: true, action: 'select_asset', matchId, ticker }`.
- Triggers a broadcast `asset_selection_update` (see below) to both players.
- Validation failures (e.g., duplicate pick) surface as `{ ok: false, error: 'internal_error' }`; full details are logged server-side.

### `deselect_asset`
- **Payload**: `{ "matchId": "m123", "ticker": "AAPL" }`.
- **Response**: `{ ok: true, action: 'deselect_asset', matchId, ticker }`.
- Broadcasts `asset_deselection_update`.

### `ready_check`
- **Payload**: `{ "matchId": "m123" }`.
- **Response**: `{ ok: true, action: 'ready_check', matchId, bothPlayersReady }` where `bothPlayersReady` is a boolean.
- Broadcast outcomes:
  - `ready_status_update` whenever a single player toggles ready.
  - When both players are ready, the server fetches live prices, transitions the match to `in_progress`, and broadcasts `match_started`.
- If the price service or DynamoDB writes fail, both players receive `{ ok: false, error: 'internal_error' }` and the match remains in `asset_selection`.

## Server → Client Broadcasts
Messages are JSON strings delivered over the same socket. Fields of interest are listed below.

### `match_found`
```json
{
  "type": "match_found",
  "matchId": "match_1700000000000_xxxxxx",
  "players": ["userA", "userB"]
}
```
Emitted when the matchmaking worker pairs two players. The client should transition the UI into the pre-match lobby and begin listening for asset updates on this `matchId`.

### `asset_selection_update`
```json
{
  "type": "asset_selection_update",
  "matchId": "match_123",
  "playerAssets": {
    "userA": {
      "assets": [
        {
          "ticker": "AAPL",
          "assetType": "STOCK",
          "selectedAt": "2025-01-01T00:00:00.000Z",
          "initialPrice": 0,
          "shares": 0
        }
      ],
      "readyAt": null
    },
    "userB": { "assets": [], "readyAt": null }
  },
  "timestamp": 1735689600000
}
```
The `playerAssets` map mirrors the DynamoDB record and always reflects the canonical state. The client should treat it as source of truth.

### `asset_deselection_update`
Structure matches `asset_selection_update`; the only difference is the `type` field.

### `ready_status_update`
```json
{
  "type": "ready_status_update",
  "matchId": "match_123",
  "playerAssets": { ... },
  "status": "asset_selection"
}
```
Emitted whenever a player toggles ready. Continue to show the lobby until `match_started` arrives.

### `match_started`
```json
{
  "type": "match_started",
  "matchId": "match_123",
  "matchStartedAt": "2025-01-01T00:05:00.000Z",
  "playerAssets": {
    "userA": {
      "assets": [
        {
          "ticker": "AAPL",
          "assetType": "STOCK",
          "selectedAt": "2025-01-01T00:00:00.000Z",
          "initialPrice": 187.22,
          "shares": 534.6
        }
      ],
      "readyAt": "2025-01-01T00:04:00.000Z"
    },
    "userB": { ... }
  },
  "message": "Match is starting! Good luck!"
}
```
Initial pricing is fetched from Twelve Data; shares are computed using `INITIAL_PORTFOLIO_VALUE / REQUIRED_ASSET_COUNT`. After this event, the match status in DynamoDB is `in_progress` and the matchmaking cache for the match is cleared.

## Match State Overview
1. **Queue** – Players send `join_matchmaking`. Redis stores their connection info and a worker job.
2. **Match Creation** – Worker pops two players, writes the match record (`status: 'asset_selection'`), and broadcasts `match_found`.
3. **Asset Selection** – Players manage their lists via `select_asset` / `deselect_asset`. The API validates against duplicates and maximum asset count (currently 3).
4. **Ready Check** – When both players send `ready_check`, the API transitions to `in_progress` and emits `match_started`. Failures (price fetch, DynamoDB write) result in an `internal_error` response and the match remains in `asset_selection`.
5. **In Progress** – The match processor service consumes live pricing updates and writes them back to DynamoDB/Redis (beyond the scope of the lobby flow). Future events (scores, match end) can be sent through the same pub/sub channel.

## Failure Handling & Recovery
- **WebSocket errors**: The server replies with `{ ok: false, error: 'internal_error' }`. The client should display a retry prompt and, when appropriate, re-send the action.
- **Disconnects**: The server removes the connection from matchmaking and cleans Redis entries. The client must reconnect and re-send `join_matchmaking` if the user wants to resume.
- **Matchmaking contention**: If DynamoDB conditional writes fail (e.g., simultaneous updates), the API logs the issue and surfaces `internal_error`. Retrying the action usually succeeds after a short delay.
- **Price service outages**: When Twelve Data returns an error, the API logs the details, keeps the match in `asset_selection`, and notifies both players via the `ready_check` response.

## Data Model Reference
- `playerAssets` is an object keyed by `userId`. Each value contains:
  - `assets`: ordered array of `{ ticker, assetType, selectedAt, initialPrice, shares }`.
  - `readyAt`: ISO timestamp once the player is ready; omitted or `null` otherwise.
- Match statuses progress through `asset_selection → in_progress → completed` (future) or `cancelled` (future handling).

Use this contract to build the lobby UI, display opponent selections in real time, and react to match start events.
