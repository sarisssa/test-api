# Backend Operation Guide

This guide documents how the Wage backend stack runs locally and in the cloud. The Fastify API now handles WebSocket traffic directly, so the architecture is reduced to two Fargate tasks (API + match-processor) backed by Redis and DynamoDB.

## Architecture
- **API (apps/api)** – Fastify service providing REST endpoints and a `/ws` WebSocket entrypoint. Handles matchmaking, asset operations, and pushes real-time updates to connected players.
- **Match Processor (apps/match-processor)** – Background worker that consumes Redis jobs, applies pricing logic, and writes updates to DynamoDB/Redis.
- **Shared package (packages/wage-shared)** – Type definitions and utilities consumed by both services.
- **Data stores** – DynamoDB single-table design for game state; Redis for matchmaking queues, pub/sub, and cached lookups.

## Environment Configuration
- Copy `apps/api/.env.example` → `apps/api/.env` and populate:
  - `JWT_SECRET`, `PHONE_HASH_SALT`
  - `REDIS_URL` (local default: `redis://127.0.0.1:6379`)
  - `DYNAMODB_URL` (local default: `http://localhost:4566`; leave empty in cloud)
  - `DYNAMODB_REGION` (e.g., `us-east-1`)
  - `WAGE_TABLE_NAME` (default `WageTable`)
  - Twilio + Twelve Data keys (stub for local testing if SMS/price fetch not required)
- Copy `apps/match-processor/.env.example` → `apps/match-processor/.env` and set the same data endpoints/API keys.

Notes:
- When `DYNAMODB_URL` contains `localhost`, the API automatically targets LocalStack; otherwise it uses AWS DynamoDB.
- Redis URLs can point to OrbStack/Docker Desktop containers or AWS ElastiCache in cloud environments.

## Local Development Workflow
1. Install dependencies: `npm install`
2. Seed environment files (see below) and set placeholder secrets for local use.
3. Start infrastructure: `docker compose -f docker-compose.dev.yml up -d` (brings up Redis + LocalStack).
4. Create the DynamoDB table in LocalStack: `npm -w api run create-table`.
5. Start the API with hot reload: `npm run dev:api`
6. (Optional) Start the match processor worker: `npm run dev:match-processor`
7. WebSocket smoke test:
   - Obtain a JWT via the `/auth` OTP flow or manually sign one using the configured `JWT_SECRET` (`{ userId: <uuid> }`).
   - `wscat -c "ws://localhost:3000/ws?token=<jwt>"`
   - Send `{ "action": "join_matchmaking" }` to enqueue the player. Responses arrive over the same socket.

### Useful REST Endpoints
- Health: `GET /health`
- Asset search: `GET /assets?search=AA&limit=10`
- Asset details: `GET /assets/:ticker`
- Price polling: `GET /assets/:symbol/price`

### Seeding Helpers (LocalStack)
- Insert an asset for testing: `npm -w api run insert-asset -- --ticker AAPL --assetType STOCK --price 123.45 --name "Apple Inc."`
- Verify price endpoint: `curl http://localhost:3000/assets/AAPL/price`

## WebSocket Contract
- Clients connect to `ws://<api-host>/ws?token=<jwt>`.
- Messages are JSON with fields:
  ```json
  {
    "action": "join_matchmaking | select_asset | deselect_asset | ready_check",
    "payload": { ... }
  }
  ```
- The server acknowledges each action with `{ ok: true, action, ... }` or `{ ok: false, error }`.
- Server-to-client messages include:
  - `match_found` – matchmaking succeeded (contains `matchId`, `players`).
  - `asset_selection_update`, `asset_deselection_update`, `ready_status_update` – lobby state changes.
  - `match_started` – match transitions to in-progress with pricing data.

Implementation details:
- Each API instance keeps in-memory socket maps and publishes all outbound messages through Redis pub/sub (`websocket:outgoing_messages`).
- Disconnects automatically clean Redis matchmaking entries and remove stale sockets.

## Deployment Paths (AWS)
- **Fastify API Fargate Service**
  1. Build/push image to ECR (contains both HTTP and WS logic).
  2. Configure task env vars (`JWT_SECRET`, Redis/Dynamo endpoints, Twilio/Twelve Data keys).
  3. ALB target group must allow HTTP/1.1 WebSocket upgrades (`/ws`).
- **Match Processor Fargate Service**
  1. Build/push worker image.
  2. Provide same Redis/Dynamo env vars.
  3. Ensure task has IAM permissions for DynamoDB.

## Cloud Verification Checklist
- API `/health` reports Redis and DynamoDB connectivity via the load balancer.
- `/assets/:symbol/price` returns seeded data from the AWS table.
- WebSocket connect → send `join_matchmaking` → observe Redis queue growth and `match_found` broadcast (check CloudWatch logs).
- End-to-end: two clients join, asset selection, ready check → verify `match_started` message and DynamoDB match status.

## OrbStack Notes (Docker alternative on macOS)
- Redis container: `docker run --name wage-redis -d -p 6379:6379 redis:7`
- LocalStack: `brew install localstack/tap/localstack-cli && localstack start`
- Use either `localhost` or `127.0.0.1` in `.env`; the API detects both as local endpoints.
- Standard workflow remains `npm run dev:api` + optional `npm run dev:match-processor`.

## Known Gaps / Coordination Items
- **DynamoDB schema drift** – Terraform currently provisions `${project}-main-<env>` with lowercase keys. Needs alignment with `WageTable`
- **Secrets management** – Production/staging must supply real Twilio + Twelve Data credentials; local runs can stub these values.
- **Integration testing** – Recommend adding automated smoke tests that connect to `/ws` and exercise matchmaking flows.
