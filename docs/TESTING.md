# Wage Platform Testing Guide

This guide explains how to exercise and verify the Wage backend (Fastify API + match processor) today, and outlines the test suites we are adding next. Use it as the checklist before every release and when standing up new environments.

---

## 1. Prerequisites
- Node.js ≥ 20 and npm ≥ 10 (matching `.nvmrc` if present).
- Workspace dependencies installed: `cd base && npm install`.
- Local infrastructure when running integration/manual tests:
  - Redis (local install, Docker, or Elasticache endpoint).
  - DynamoDB (AWS table or LocalStack/DynamoDB Local).
  - Twelve Data API key (set `TWELVE_DATA_API_KEY` or mock responses).
- Optional (recommended for settlement tests): configure AWS Step Functions. For LocalStack set `STEP_FUNCTIONS_ENDPOINT=http://localhost:4566`, then run `npm run setup:step-functions -w api` to create or update the match-settlement workflow. Copy the printed ARN into `MATCH_SETTLEMENT_STATE_MACHINE_ARN` before starting the API.
- For WebSocket/manual flows, the API service must be running (`npm run dev:api` or deployed Fargate task).

Environment variables live under `base/apps/api/.env` and `base/apps/match-processor/.env`. Create `.env.local` copies whenever you need to override defaults.

---

## 2. Automated Checks (Current State)

| Command | Description | Notes |
| --- | --- | --- |
| `npm run lint` | Runs eslint for each workspace with `eslint.config.js`. | Fails on stylistic or unsafe code. |
| `npm run build` | Type-checks every workspace. | Useful to catch missing exports or schema drift. |
| `npm run dev:api` / `npm run dev:match-processor` | Starts Fastify or match loop with `tsx watch`. | Use in combination with the manual test checklist. |

> There are no Jest/Vitest unit tests yet; section 5 describes what to add first.

---

## 3. Integration Test Harness

We are standardising on Docker Compose for shared infrastructure. Until the compose files land, you can mimic the staging stack manually:

1. **Redis**  
   ```bash
   docker run --name wage-redis -p 6379:6379 -d redis:7-alpine
   ```  
   Point both services to `redis://127.0.0.1:6379`.

2. **DynamoDB Local**  
   ```bash
   docker run --name wage-dynamodb -p 8000:8000 -d amazon/dynamodb-local
   ```  
   Export `DYNAMODB_URL=http://127.0.0.1:8000` and run `npm run create-table -w api`.

3. **Seed data**  
   ```bash
   npm run seed-db -w api
   npm run seed-users -w api    # optional, see seed scripts
   ```

4. **Exercise workflows** with the manual steps from section 4.

5. **End-to-end smoke**  
   ```bash
   npm run system:test -w api
   ```  
   Runs the orchestration script that prepares DynamoDB, seeds assets/players, drives WebSocket matchmaking, and (optionally) validates Step Functions settlements against LocalStack.

Future work: add a `docker-compose.test.yml` that boots Redis + DynamoDB Local and exposes them through `npm run test:integration`.

---

## 4. Manual Verification Checklist

These scenarios mirror the connection-lifecycle and broadcast guarantees called out in design reviews. Run them when touching matchmaking, WebSocket, or pricing code.

### A. WebSocket Lifecycle
1. Start the API (`npm run dev:api -w api`) and connect with the test client (e.g., Postman, `wscat`, or the mobile app). Endpoint: `ws://localhost:3000/match-gateway/ws`.
2. Confirm the server responds with a `connectionId` (see API logs).  
   `redis-cli HGETALL player:<userId>` should be empty until join.
3. Send `{"action":"join_matchmaking","userId":"player-1"}`.  
   - Verify Redis stores `connectionId` under `player:player-1`.  
   - Check the job queue `LRANGE matchmaking:jobs:list 0 -1` contains the join message.
4. Disconnect the client. Ensure the server logs the removal and Redis cleanup job removes stale hashes (manual for now).

### B. Match Creation and Broadcasts
1. Enqueue two players (`player-1`, `player-2`) via WebSocket join.  
2. Watch the worker logs (`startMatchmakingWorker`) and confirm a match is created in DynamoDB (`MATCH#<id>` item) and Redis `match:<id>`.
3. Capture the outgoing WebSocket messages: `match_found`, `asset_selection_update`, `ready_status_update`. Ensure payloads include full `playerAssets`.
4. Select/deselect assets through the socket and validate the broadcast snapshots mirror DynamoDB state.

### C. Match Start & Pricing Loop
1. Ready both players (`{"action":"ready_check", ...}`) and verify `match_started` broadcast includes initial prices/shares.  
   DynamoDB item must transition to `status = in_progress`.
2. Run the match processor locally (`npm run dev:match-processor -w match-processor`).  
   - Check it logs active matches, calls Twelve Data (or mock), and updates DynamoDB PK `ASSET#`.
   - Confirm future broadcasts emit `price_update` snapshots (after implementation).

### D. Forfeit / Surrender Events (planned)
Once the new events land, simulate forfeits:
1. Trigger the API endpoint or WebSocket action that marks a player as forfeited during asset selection.  
   Expect `player_forfeited` broadcast with `phase: "asset_selection"` and match status update.
2. Trigger a surrender during `in_progress`.  
   Expect the same event with `phase: "in_progress"` plus `winnerId`.

### E. Token Refresh Flow
1. Complete OTP sign-in and capture the returned `refreshToken`.
2. Call `POST /auth/token/refresh` with `{ "refreshToken": "<token>" }`.  
   - Expect `200 OK` with fresh `accessToken`, `refreshToken`, `refreshTokenExpiresAt`.
   - Ensure the original refresh token is rejected if re-used (should return `401`).
3. Retry a protected API request using the new access token to confirm it authorises correctly.

Record findings in release notes and file bugs for any mismatch.

---

## 5. Test Suites To Implement Next

Priority order for automated coverage:

1. **Unit Tests**
   - `repositories/matchmaking-repository` — ensure Lua script binding returns matched players and handles duplicates.
   - `repositories/match-repository` — cover asset add/remove, ready status transitions, conditional failures.
   - `services/match.ts` — validate match start logic, ticker validation, broadcast payload assembly.

   Suggested tooling: Vitest (Node ESM-friendly) with in-memory stubs for Redis/DynamoDB.

2. **Integration Tests**
   - Matchmaking queue end-to-end using Dockerised Redis & DynamoDB Local; drive WebSocket messages with `ws` client and assert database state.
   - Match processor price ingestion using mock Twelve Data responses.

3. **Contract Tests**
   - Define JSON schemas for WebSocket broadcasts (match found, asset updates, price updates) and write snapshot tests to detect accidental shape changes.

4. **Performance / Load**
   - Once API Gateway/ALB timeouts are tuned, use k6 or Artillery scripts to simulate burst matchmaking joins and long-lived WebSocket connections.

Each suite should run via `npm run test:<name>` and be wired into CI (see `docs/ARCHITECTURE.md` next steps).

---

## 6. Production Smoke Tests

After every deploy run:
- `GET /health` (already wired to the ALB health check).
- WebSocket handshake + `ping`/`pong`.
- Single matchmaking round-trip on a staging namespace with throwaway players.
- Verify match processor logs in CloudWatch show successful iteration (matches, tickers > 0).

Automating these as synthetic monitors (e.g., CloudWatch Synthetics, Grafana k6) is recommended for GA.

---

## 7. Reporting Issues

Log failures in the engineering slack channel with:
- Environment, build/tag, and command run.
- Relevant logs (Fastify, worker, Redis, DynamoDB).
- Payloads used (WebSocket messages, REST calls).
- Suggested acceptance criteria updates to prevent regressions.

Keep this document up to date whenever test coverage or manual flows change. Cross-link new scripts or dashboards so onboarding engineers can reproduce your setup quickly.
