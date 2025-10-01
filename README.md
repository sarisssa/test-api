# Wage Backend

Fastify-based backend that powers live matchmaking, asset research, and real-time game updates for Wage. The service consists of two deployable workloads:

- **API (`apps/api`)** – Exposes REST endpoints and a native WebSocket entrypoint (`/ws`). Handles authentication, matchmaking orchestration, asset lookups, and WebSocket fan-out via Redis.
- **Match Processor (`apps/match-processor`)** – Background worker that consumes Redis jobs, updates pricing information, and writes match/asset state to DynamoDB.

Supporting infrastructure: DynamoDB (single-table design), Redis (queues + pub/sub + cache), and shared TypeScript utilities under `packages/wage-shared`.

## Quick Start

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/match-processor/.env.example apps/match-processor/.env
docker compose -f docker-compose.dev.yml up -d   # Redis + LocalStack
npm -w api run create-table                       # provision WageTable in LocalStack
npm run dev:api                                   # start Fastify API on :3000
# optional worker
npm run dev:match-processor
```

Smoke-test the socket flow with a locally signed JWT:

```bash
wscat -c "ws://localhost:3000/ws?token=<jwt>"
> {"action":"join_matchmaking"}
```

REST endpoints:

- `GET /health`
- `GET /assets?search=AA&limit=10`
- `GET /assets/:ticker`
- `GET /assets/:symbol/price`
- `POST /auth/send-otp`, `POST /auth/verify-otp`
- `GET /user`, `PUT /user/username`, `GET /user/matches`

## Deployment Overview

The intended cloud layout is two Fargate services (API + match-processor) behind an ALB, both pointing at managed Redis and DynamoDB. The API now owns WebSocket connections directly; `ws-gateway` (API Gateway + Lambda) has been deprecated.

High-level deployment steps:

1. Build/push container images to ECR (`apps/api`, `apps/match-processor`).
2. Configure task definitions with required env vars (`JWT_SECRET`, Redis endpoint, DynamoDB region/table, Twilio/Twelve Data credentials).
3. Ensure the ALB target group allows HTTP/1.1 upgrade so `/ws` WebSockets stay open.
4. Grant IAM permissions: API tasks need DynamoDB + Redis access (via VPC) and any external APIs; match-processor needs DynamoDB + Twelve Data.
5. After deploy, verify `/health`, `/assets/:symbol/price`, WebSocket matchmaking (`match_found` events), and match start transitions (`match_started`).

## Key Documentation

- `instructions.md` – Backend operation guide (local workflow, architecture, cloud checklist).
- `docs/frontend/api-guide.md` – REST contract, payloads, and error semantics for frontend engineers.
- `docs/frontend/match-lifecycle.md` – WebSocket actions, broadcasts, and match state transitions.

## Testing & Troubleshooting

- Local smoke tests: use `wscat`, triggered REST calls, and watch the API logs (`npm run dev:api`).
- Common issues:
  - `ECONNREFUSED localhost:4566` → LocalStack not running. Start via `docker compose ...`.
  - `Asset not found` on `/assets/:symbol/price` → seed using `npm -w api run insert-asset -- --ticker AAPL ...`.
  - WebSocket disconnects → ensure JWT is valid and Redis is reachable.

## Contributing

1. Create a branch (e.g., `git checkout -b feat/api-native-websockets`).
2. Make changes, update docs/tests.
3. Run `npm run build -w api` (and other relevant builds) locally.
4. Submit a pull request referencing the relevant documentation.

Refer to the backend operation guide for deeper deployment notes and coordination items.
