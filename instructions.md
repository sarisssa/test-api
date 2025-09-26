# WebSockets and API: Operation Guide

This document standardizes WebSocket handling in AWS and describes how the API and supporting services run locally and in cloud environments. The intent is to make development, testing, and deployment clear and repeatable for the team.

## Overview
- WebSocket connections are managed by API Gateway + Lambda; the ECS Fastify API handles the business logic.
- The Lambda proxies messages to the API (`POST /ws/inbound`). The API can push messages back to clients using the API Gateway Management API.
- DynamoDB holds game/matchmaking and asset data. For local development, LocalStack provides a local DynamoDB endpoint.

## Components
- `apps/ws-gateway`: Serverless service exposing `$connect`, `$disconnect`, `$default` routes. Creates the WebSocket connections table.
- `apps/api`: Fastify API. Manages users, matchmaking, asset lookups, and receives proxied WebSocket messages via `/ws/inbound`.
- `apps/match-processor`: Batch/stream worker for pricing and match updates.
- `packages/wage-shared`: Helpers including API Gateway Management API client for sending to WebSocket connections.

## Configuration (env)
- API (`apps/api/.env`): see `.env.example`. Required for local development:
  - `JWT_SECRET`, `PHONE_HASH_SALT`
  - `REDIS_URL` (e.g., `redis://127.0.0.1:6379`)
  - `DYNAMODB_URL` (set to `http://localhost:4566` for LocalStack)
  - `DYNAMODB_REGION` (e.g., `us-east-1`)
  - `WAGE_TABLE_NAME` (default `WageTable`)
  - Twilio keys are required for `/auth` flows; for local non-auth testing, stub with placeholders.
- WS Gateway (`apps/ws-gateway/.env`): `JWT_SECRET`, `INTERNAL_API_URL` (e.g., `http://localhost:3000`).
- Match Processor (`apps/match-processor/.env`): `WAGE_TABLE_NAME`, AWS region, plus any data provider keys as needed.

Notes
- In cloud environments, `DYNAMODB_URL` MUST be empty to use AWS DynamoDB. LocalStack is automatically detected when `DYNAMODB_URL` includes `localhost`.
- The WS connections table name is `${service}-connections-${stage}` (e.g., `ws-gateway-connections-dev`).

## Local Development (offline)
1) Install dependencies
```
npm install
```
2) Copy env examples and fill the required values
```
cp apps/api/.env.example apps/api/.env
cp apps/ws-gateway/.env.example apps/ws-gateway/.env
```
3) Start local infrastructure (Redis and LocalStack)
```
docker compose -f docker-compose.dev.yml up -d
```
4) Build services (optional during iteration)
```
npm run build -w api
npm run build -w ws-gateway
```
5) Run the API
```
npm run dev:api
```
6) Run the WebSocket gateway (Serverless Offline, ws on port 3003)
```
npm -w ws-gateway run dev
```
7) WebSocket smoke test
```
wscat -c "ws://localhost:3003?token=<jwt>"
> {"action":"echo","payload":{"msg":"hello"}}
```

## API Endpoints for Offline Testing
- Health: `GET /health` (reports Redis status and configured URLs)
- Assets search: `GET /assets?search=AA&limit=10`
- Asset by ticker: `GET /assets/:ticker`
- Polling price: `GET /assets/:symbol/price`

Seeding helpers (LocalStack on 4566)
- Create the local table: `npm -w api run create-table`
- Insert one asset: `npm -w api run insert-asset -- --ticker AAPL --assetType STOCK --price 123.45 --name "Apple Inc."`
- Verify: `curl http://localhost:3000/assets/AAPL/price`

## WebSocket Inbound Contract
The WS gateway forwards to `POST {INTERNAL_API_URL}/ws/inbound` with:
```
{
  "action": "<action>",
  "payload": { ... },
  "connectionId": "...",
  "userId": "...",
  "requestContext": { "domainName": "...", "stage": "..." }
}
```
The API routes on `action` and performs matchmaking and asset operations.

## Sending Messages Back To Clients
Use the shared helper (`wage-shared`):
```
import { sendToConnection } from 'wage-shared'

await sendToConnection({
  domainName: record.domainName,
  stage: record.stage,
  connectionId: record.connectionId,
  data: { type: 'state_update', payload: {...} }
})
```
Fan out by querying `userId-index` in the WS connections table and iterating all connections for that user.

IAM required on the ECS task role:
```
{
  "Effect": "Allow",
  "Action": "execute-api:ManageConnections",
  "Resource": "arn:aws:execute-api:<region>:<account>:<api-id>/*/<stage>/@connections/*"
}
```

## Deployment Paths (backend)
- API (ECS):
  1. Build and push the container image to ECR.
  2. Ensure task environment variables are set (JWT/Twilio/Redis/region).
  3. Leave `DYNAMODB_URL` unset in ECS to use AWS DynamoDB.
- WS Gateway (Serverless):
  1. `npm -w ws-gateway run build`
  2. `npm -w ws-gateway run deploy -- --stage dev`
  3. Provide `JWT_SECRET` and `INTERNAL_API_URL` via env for the stage.
  4. Connect clients to `wss://<api-id>.execute-api.<region>.amazonaws.com/dev?token=<jwt>`.
- Match Processor (Serverless/Lambda): deploy from `apps/match-processor` using its Serverless configuration.

## Online Tests (cloud)
- Health check the API via ALB: `GET /health`.
- Price polling flows against DynamoDB assets.
- WS connect, send action payloads via gateway, and verify API receives and processes `/ws/inbound`.
- End-to-end: trigger a matchmaking action and confirm fan-out to client connections using the Management API.

## Troubleshooting
- ECONNREFUSED to `127.0.0.1:4566` or `::1:4566` during `npm run dev:api`:
  - LocalStack is not running. Start it with `docker compose -f docker-compose.dev.yml up -d`.
  - Verify: `curl -s localhost:4566/_localstack/health | jq` (should show services healthy).
- API fails to start in cloud due to DynamoDB connection errors:
  - Ensure `DYNAMODB_URL` is empty in ECS; the API must connect to AWS DynamoDB in cloud.
- 404 on `GET /assets/:symbol/price`:
  - The item is absent in DynamoDB. Use the insert-asset script to seed a test record in LocalStack.
- WebSocket offline port:
  - Serverless Offline runs on port 3003 (not 3002).
- Twilio errors locally:
  - Provide test credentials for Twilio or avoid hitting `/auth` during local iteration.

## OrbStack Setup (alternative to Docker Desktop fo MacOS users)
- Redis
  - Pull image: `docker pull redis:7`
  - Start: `docker run --name wage-redis -d -p 6379:6379 redis:7`
  - Optional (with config file):
    - `docker run -d --name wage-redis -p 6379:6379 -v $(pwd)/docker/redis/redis.conf:/usr/local/etc/redis/redis.conf redis:latest redis-server /usr/local/etc/redis/redis.conf`
- LocalStack
  - CLI: `brew install localstack/tap/localstack-cli`
  - Start: `localstack start`
  - Verify:
    - `docker ps` shows a `localstack` container
    - `curl -s localhost:4566/_localstack/health | jq` returns healthy services
    - Optional: `awslocal dynamodb list-tables`
- Environment
  - `apps/api/.env` should include: `REDIS_URL=redis://127.0.0.1:6379`, `DYNAMODB_URL=http://localhost:4566`, `DYNAMODB_REGION=us-east-1`, `WAGE_TABLE_NAME=WageTable`
- Create local table and run API
  - `npm -w api run create-table`
  - `npm run dev:api`
- Notes
  - Only one Redis container can bind `6379`. Stop other Redis containers if the port is in use.
  - The project supports either `localhost` or `127.0.0.1` for LocalStack. Both are detected automatically.
  - `docker compose -f docker-compose.dev.yml up -d` remains a valid alternative under OrbStack.

## Known Inconsistencies and Stability Improvements
- Table schema/name drift:
  - The application uses `WageTable` with `PK/SK` (uppercase). The Terraform `infrastructure/dynamodb.tf` defines a table `${var.project_name}-main-${var.environment}` with `pk/sk` (lowercase) and different GSIs.
  - Action: coordinate with DevOps to align Terraform to the current schema or plan a code migration to the infra schema. Until resolved, local development uses `WageTable` via LocalStack.
- Centralized table name:
  - The API now reads `WAGE_TABLE_NAME` from env; hard-coded references were removed. The match-processor already supported this.
- Safer environment defaults:
  - `DYNAMODB_URL` no longer defaults to LocalStack in code; it remains empty in cloud and must be explicitly set for local development.
- Dev ergonomics:
  - `docker-compose.dev.yml` is provided to spin up Redis and LocalStack quickly.

## Ownership Notes
The API, WebSocket gateway, and DynamoDB tables are designed to be operated together. The setup above standardizes local development to mirror the cloud environment while keeping iteration fast and reliable.
