# How I’m Fixing Our WebSockets In AWS (And How You Can Run It)

We’re moving WebSocket connection management off ECS and into API Gateway + Lambda. API Gateway will hold the sockets; a tiny Lambda will proxy messages to our existing ECS Fastify API. ECS keeps all business logic, but it no longer owns long‑lived connections (so deploys/restarts don’t drop players).

What I added to the repo:
- `apps/ws-gateway`: Serverless service with a WebSocket API (`$connect/$disconnect/$default`) and a DynamoDB table to store connections.
- `packages/wage-shared/src/aws/apigw-management.ts`: a helper ECS can use to send messages to clients via the API Gateway Management API.

API changes for research data:
- Replaced the research WebSocket with a simple polling endpoint in the API.
- New route `GET /assets/:symbol/price` returns `{ ticker, price, lastUpdated }` from DynamoDB and increments a `researchCount` counter.
- Removed research WS route and subscription manager; the API no longer registers `@fastify/websocket` routes.

What this gives us:
- Reliable sockets during ECS deploys and scaling.
- A canonical place (DynamoDB) to map users ↔ connections.
- A single HTTP handoff from sockets → our API for all game/matchmaking actions.

## Architecture (at a glance)
- API Gateway (WebSocket): maintains client connections.
- Lambda (single function):
  - `$connect`: validate JWT, save `connectionId/userId/domainName/stage` in DynamoDB.
  - `$disconnect`: remove the record.
  - `$default`: forward messages to our API at `POST {INTERNAL_API_URL}/ws/inbound`.
- ECS (Fastify API): handles the real work; can push to clients using the stored `connectionId`s.

## Environment I’m Using
- ws-gateway (`apps/ws-gateway/.env`):
  - `JWT_SECRET` (same as API uses)
  - `INTERNAL_API_URL` (our API base URL; e.g., `http://localhost:3000` locally or the ALB URL in dev/prd)
- api (`apps/api/.env`): see `.env.example` (ensure `REDIS_URL`, `DYNAMODB_URL`, `DYNAMODB_REGION`, `JWT_SECRET`, `PHONE_HASH_SALT`, etc.).
- match-processor (`apps/match-processor/.env`): see `.env.example`.

Connections table name is `${service}-connections-${stage}` (Serverless sets this; e.g., `ws-gateway-connections-dev`).

## DynamoDB Shape
- PK: `connectionId` (S)
- Attributes: `userId` (S), `domainName` (S), `stage` (S), `connectedAt` (ISO)
- GSI: `userId-index` (query by user to fan out to all their devices)

## How I Run This Locally
1) Install deps at the repo root
```
npm install
```
2) Copy env examples and fill them in
```
cp apps/ws-gateway/.env.example apps/ws-gateway/.env   # set JWT_SECRET, INTERNAL_API_URL
cp apps/api/.env.example apps/api/.env                 # set Redis/Dynamo/etc.
```
3) Optional local infra
```
docker run -d --name wage-redis -p 6379:6379 redis:7
docker run -d --name localstack -p 4566:4566 -e SERVICES=dynamodb,sqs localstack/localstack
```
4) Build both
```
npm run build -w api
npm run build -w ws-gateway
```
5) Run the API (Fastify)
```
npm run dev:api
```
6) Run the WebSocket gateway (Serverless Offline, ws on port 3002)
```
npm -w ws-gateway run dev
```
7) Smoke test with a JWT
```
wscat -c "ws://localhost:3002?token=<jwt>"
> {"action":"echo","payload":{"msg":"hello"}}
```

Note: API Gateway’s Management API is best exercised against a deployed stack; offline is great for iteration.

## API Research Polling Endpoint
- Endpoint: `GET /assets/:symbol/price`
- Behavior:
  - Looks up the asset in DynamoDB using key `(PK: ASSET#<AssetType>, SK: <Symbol>)`.
  - Returns current price and lastUpdated.
  - Increments `researchCount` on the asset as a best‑effort counter.
- If the item isn’t present, the endpoint returns 404. For local testing, insert an item that matches the repository key pattern (below).

## Local Testing Helper (insert a single asset)
- Script: `apps/api/src/scripts/insert-asset.ts`
- Usage (LocalStack on 4566):
  - `npm -w api run create-table`
  - `npm -w api run insert-asset -- --ticker AAPL --assetType STOCK --price 123.45 --name "Apple Inc."`
- Verify:
  - `curl http://localhost:3000/assets/AAPL/price`
  - Expected: `{ "ticker": "AAPL", "price": 123.45, "lastUpdated": "..." }`
  - Each call increments `researchCount` on that item.

## What Our API Needs To Receive
Lambda forwards to `POST {INTERNAL_API_URL}/ws/inbound` with:
```
{
  "action": "SomeAction",
  "payload": { ... },
  "connectionId": "...",
  "userId": "...",            
  "requestContext": { "domainName": "...", "stage": "..." }
}
```
Minimal Fastify route we can drop in:
```
fastify.post('/ws/inbound', async (req, reply) => {
  const body = req.body
  // TODO: switch on body.action → route into our existing services
  return reply.code(200).send({ ok: true })
})
```

## How We Send Messages Back To Clients From ECS
Use the shared helper in `wage-shared`:
```
import { sendToConnection } from 'wage-shared'

await sendToConnection({
  domainName: record.domainName,
  stage: record.stage,
  connectionId: record.connectionId,
  data: { type: 'state_update', payload: {...} }
})
```
Fan out to all connections for a user by querying the `userId-index` GSI and iterating.

Grant the ECS task role this permission to talk to the WebSocket API:
```
{
  "Effect": "Allow",
  "Action": "execute-api:ManageConnections",
  "Resource": "arn:aws:execute-api:<region>:<account>:<api-id>/*/<stage>/@connections/*"
}
```

## How I Deploy The WebSocket Gateway
```
npm -w ws-gateway run build
npm -w ws-gateway run deploy -- --stage dev
```
Then I set `JWT_SECRET` and `INTERNAL_API_URL` for that stage (via Serverless/env). Serverless prints the WebSocket URL; point the client at:
```
wss://<api-id>.execute-api.<region>.amazonaws.com/dev?token=<jwt>
```

## Rollout Plan
- Deploy `ws-gateway` and verify `$connect/$disconnect/$default`.
- Add `POST /ws/inbound` to the API, confirm it gets messages.
- Point clients at the new WebSocket URL and send `{ action, payload }`.
- Wire ECS → client pushes using `sendToConnection` (and the `userId-index`).
- Remove the in‑memory WebSocket maps from ECS once verified.

## Ops Notes
- Connections won’t drop during ECS deploys anymore—API Gateway owns them.
- `$disconnect` cleans up; consider TTL/periodic checks to remove stragglers.
- Add CloudWatch metrics around connects/disconnects/forwards/error rates.
- If the API is private, run the Lambda in our VPC or expose a secured ingress path.

## If Something Isn’t Working
- 401 on connect → token invalid or `JWT_SECRET` not set in ws-gateway.
- API not receiving messages → check `INTERNAL_API_URL` and `/ws/inbound` handler.
- Can’t send to clients → ensure we saved `domainName/stage`, and ECS has `execute-api:ManageConnections`.
- 404 on `GET /assets/:symbol/price` → the item isn’t in DynamoDB with key `(PK: ASSET#<AssetType>, SK: <Symbol>)`. Use the insert‑asset script above to seed a test record.
