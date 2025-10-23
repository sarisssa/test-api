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
- Optional (recommended for settlement tests): configure AWS Step Functions on LocalStack. See the next section for a streamlined deploy that also updates your env files.
- For WebSocket/manual flows, the API service must be running (`npm run dev:api` or deployed Fargate task).
- Match processor pulls live prices every 10 seconds. Outside stock hours you can set `MATCH_PROCESSOR_FORCE_MARKET_OPEN=true` (or `MATCH_PROCESSOR_FORCE_MARKET_CLOSED=true`) in `apps/match-processor/.env` to make the processor run deterministically.

Environment variables live under `base/apps/api/.env` and `base/apps/match-processor/.env`. Create `.env.local` copies whenever you need to override defaults.

---

## 1.1 Settlement Workflow (LocalStack) — Quick Setup

Use this when you want matches to complete automatically on the timer via Step Functions and broadcast the result to connected clients.

1. Deploy the settlement Lambdas and update env files

```bash
# From repo root
## Default (Docker Desktop/macOS)
npm run -w api deploy:lambdas

## Custom LocalStack host (e.g., localstack-main.orb.local)
# Lambdas must reach LocalStack/Redis from inside their container. Set:
LAMBDA_LOCALSTACK_HOST=localstack-main.orb.local \
  npm run -w api deploy:lambdas
```

This bundles and deploys:

- `match-compute-outcome` → sets `MATCH_COMPUTE_OUTCOME_FN_ARN`
- `match-broadcast-completion` → sets `MATCH_BROADCAST_COMPLETION_FN_ARN`

Both apps/api/.env and apps/api/.env.example are updated with the ARNs.

2. Create or update the Step Functions state machine

```bash
npm run setup:step-functions -w api
```

Copy the printed ARN into `MATCH_SETTLEMENT_STATE_MACHINE_ARN` in `apps/api/.env` if it differs, then restart the API.

3. Seed DynamoDB and price rows

- Run `npm run setup:system -w api`. This is idempotent: it creates the Wage table if needed, ensures the state machine exists, and seeds price rows for stock, crypto, and commodity tickers so the match processor can run 24/7.
- Optional follow-up: `npm run create-table -w api` if you need to re-create the table manually.

4. Verify base env for local dev

- `STEP_FUNCTIONS_ENDPOINT=http://localhost:4566` (or `http://localstack-main.orb.local:4566`)
- `DYNAMODB_URL=http://localhost:4566` (or same custom host)
- `WAGE_TABLE_NAME=WageTable`
- `REDIS_URL=redis://127.0.0.1:6379`

Notes

- The internal settlement worker runs as a safety net and finalizes time‑expired matches if a winner is missing. With Step Functions configured, it will typically find nothing to do.
- The initial portfolio budget is `$100,000`; shares are sized from that budget at match start.

---

## 1.2 Commands Quick Reference

- Deploy settlement Lambdas to LocalStack and update env files:
  - `npm run -w api deploy:lambdas`
- Create/update Step Functions state machine (reads env ARNs):
  - `npm run setup:step-functions -w api`
- Provision table + state machine + seed price rows:
  - `npm run setup:system -w api`
- Start services:
  - API: `npm run dev:api`
  - Match processor: `npm run dev:match-processor`
- Run end‑to‑end system check:
  - `npm run system:test -w api`
- Inspect a match record quickly:
  - `npx tsx src/scripts/debug-match.ts <matchId>`

Verification (LocalStack CLI):

- List Lambdas: `aws lambda list-functions --region us-east-1 --endpoint-url http://localhost:4566`
- List state machines: `aws stepfunctions list-state-machines --region us-east-1 --endpoint-url http://localhost:4566`
  - If using a custom host, swap `http://localhost:4566` for `http://localstack-main.orb.local:4566`.

---

## 2. Automated Checks (Current State)

| Command                                           | Description                                             | Notes                                              |
| ------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| `npm run lint`                                    | Runs eslint for each workspace with `eslint.config.js`. | Fails on stylistic or unsafe code.                 |
| `npm run build`                                   | Type-checks every workspace.                            | Useful to catch missing exports or schema drift.   |
| `npm run dev:api` / `npm run dev:match-processor` | Starts Fastify or match loop with `tsx watch`.          | Use in combination with the manual test checklist. |

> There are no Jest/Vitest unit tests yet; section 5 describes what to add first.

---

## 3. Integration Test Harness

We are standardising on Docker Compose for shared infrastructure. Until the compose files land, you can mimic the staging stack manually:
You can skip steps 3 and 4, assuming you have steps 1 and 2 set-up, just run step 5 with `localstack`, `api` and `match-processor` running.

1. **Redis**

   ```bash
   docker run --name wage-redis -p 6379:6379 -d redis:7-alpine
   ```

   Point both services to `redis://127.0.0.1:6379`.

2. **DynamoDB / LocalStack**
   - Option A (LocalStack): ensure LocalStack is running at `http://localhost:4566` and set `DYNAMODB_URL=http://localhost:4566`. Run `npm run setup:system -w api` to create the table, refresh the Step Functions definition, and seed price rows.
   - Option B (DynamoDB Local):
     ```bash
     docker run --name wage-dynamodb -p 8000:8000 -d amazon/dynamodb-local
     ```
     Export `DYNAMODB_URL=http://127.0.0.1:8000`, run `npm run create-table -w api`, then `npm run setup:system -w api` to seed price rows.

3. **Seed data (optional extras)**

   ```bash
   npm run seed-db -w api        # large asset metadata set, already covered by setup:system
   npm run seed-users -w api    # optional, see seed scripts
   ```

4. **Exercise workflows** with the manual steps from section 4.

5. **End-to-end smoke**

   ```bash
   npm run system:test -w api
   ```

   Runs the orchestration script that prepares DynamoDB, seeds assets/players, drives WebSocket matchmaking, and validates settlements. It runs two matches concurrently:
   - A/B: forfeit scenario (outcome depends on live prices; the script logs the winner without enforcing Player A victory).
   - C/D: 30s timed match with distinct crypto assets. Live prices from the match processor update the players' portfolios, so expect small real-world gains or losses. Set `MATCH_PROCESSOR_FORCE_MARKET_OPEN=true` when equities are closed to keep the loop running locally.

   **Important**: The script now verifies which settlement method was used:
   - ✅ **Step Functions + Lambdas**: If `MATCH_SETTLEMENT_STATE_MACHINE_ARN` is set, matches will use Step Functions settlement (validates actual AWS infrastructure)
   - ⚠️ **Settlement Worker Fallback**: If the ARN is not set, matches use the local fallback worker (does not test Step Functions/Lambdas)

   To properly test Step Functions before AWS deployment:

   ```bash
   # 1. Deploy Lambdas to LocalStack
   npm run deploy:lambdas -w api

   # 2. Create/update state machine (sets ARN in .env)
   npm run setup:step-functions -w api

   # 3. Run system test - should now use Step Functions
   npm run system:test -w api
   ```

   Check the output for "Settlement Method Summary" to confirm Step Functions executed.

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
   - Zero prices from seed data are treated as not fresh; the first run fetches real prices before caching.
   - Confirm future broadcasts emit `price_update` snapshots (after implementation).

### D. Win Condition (Percent‑Based)

- Budget is fixed at `$100,000` per player; shares are sized from that budget at match start.
- Winner is the player with the higher percentage return; since budgets match, comparing final portfolio totals is equivalent to comparing returns.
- The match processor writes refreshed `currentPrice` fields back into each match via `playerAssets`, and the settlement Lambda reads items with `ConsistentRead=true`, so the compute-outcome recheck in the system script now aligns with stored winners even immediately after forfeits.

### E. Concurrency & Connections

- System check opens four WebSocket connections (A/B/C/D) and runs two matches concurrently.
- After a scenario completes, the script closes those sockets; API logs may show fewer “Active connections” at different moments — this is expected as clients disconnect in finally blocks.

### F. Forfeit / Surrender Events

Once the new events land, simulate forfeits:

1. Trigger the API endpoint or WebSocket action that marks a player as forfeited during asset selection.  
   Expect `player_forfeited` broadcast with `phase: "asset_selection"` and match status update.
2. Trigger a surrender during `in_progress`.  
   Expect the same event with `phase: "in_progress"` plus `winnerId`.

### G. Token Refresh Flow

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

## 6. Troubleshooting

- Step Functions run timeouts (timed match doesn’t complete):
  - Ensure Lambdas are deployed: `npm run -w api deploy:lambdas`, then `aws lambda list-functions --endpoint-url http://localhost:4566`.
  - Ensure the state machine was updated: `npm run setup:step-functions -w api` and set `MATCH_SETTLEMENT_STATE_MACHINE_ARN`.
  - Check LocalStack executions for failures in `ComputeOutcome` or `CompleteMatchWithOutcome`.
  - If needed, temporarily unset `MATCH_COMPUTE_OUTCOME_FN_ARN` to fall back to direct `CompleteMatch` during local iteration.
- Lambda cannot reach LocalStack (ECONNREFUSED 127.0.0.1:4566):
  - Lambdas run in Docker; `127.0.0.1` points to the Lambda container, not your host.
  - Our deploy script sets Lambda env to use `host.docker.internal` by default.
  - If your environment exposes LocalStack via another DNS (e.g., `localstack-main.orb.local`), run deploy with:
    - `LAMBDA_LOCALSTACK_HOST=localstack-main.orb.local npm run -w api deploy:lambdas`
  - Alternatively override URLs directly:
    - `LAMBDA_DYNAMODB_URL=http://localstack-main.orb.local:4566 LAMBDA_REDIS_URL=redis://localstack-main.orb.local:6379 npm run -w api deploy:lambdas`
- LocalStack credentials errors (Partial credentials / missing secret):
  - Use LocalStack creds: `AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test` (the deploy scripts set these automatically).
- DynamoDB table not found on boot:
  - Create it: `npm run create-table -w api` (with `DYNAMODB_URL=http://localhost:4566`).
- Price remains `$0` after seeding:
  - First run will fetch and cache non‑zero prices; verify match‑processor logs show price updates, or set `USE_PRICE_SERVICE_STUB=true` for entirely local runs.
  - Ensure `TWELVE_DATA_API_KEY` is not a placeholder (e.g., `dummy` or `replace-with-real-key`); the service falls back to the stub when the key is missing.

### Match IDs in Logs

- System check prints both match IDs on completion:
  - `⏱️  Timed Match <id>` and `🏳️  Forfeit Match <id>` with totals and returns.
- Lobby tests remain part of the flow in section 4 (asset selection, ready checks, and broadcast assertions).

## 7. Production Smoke Tests

After every deploy run:

- `GET /health` (already wired to the ALB health check).
- WebSocket handshake + `ping`/`pong`.
- Single matchmaking round-trip on a staging namespace with throwaway players.
- Verify match processor logs in CloudWatch show successful iteration (matches, tickers > 0).

Automating these as synthetic monitors (e.g., CloudWatch Synthetics, Grafana k6) is recommended for GA.

---

## 8. Reporting Issues

Log failures in the engineering slack channel with:

- Environment, build/tag, and command run.
- Relevant logs (Fastify, worker, Redis, DynamoDB).
- Payloads used (WebSocket messages, REST calls).
- Suggested acceptance criteria updates to prevent regressions.

Keep this document up to date whenever test coverage or manual flows change. Cross-link new scripts or dashboards so onboarding engineers can reproduce your setup quickly.
