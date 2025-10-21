# Wage Platform Architecture & Operations

## 1. Product Context
- **Purpose**: peer-vs-peer knowledge wagers on asset growth (equities, commodities, crypto).  
- **Experience**: mobile app (Expo) backed by a Fastify API and a match-processing worker.  
- **Target stack**: two ECS Fargate services (`api`, `match-processor`) behind an ALB, shared Redis, DynamoDB single table, S3, Twilio, TwelveData market data.

## 2. Runtime Components
- **API Service (`base/apps/api`)**  
  Runs Fastify with HTTP REST + in-process WebSocket server. Handles authentication, matchmaking lifecycle, asset catalog, invites, friends, Twilio verification, research subscriptions. Bootstraps Redis, DynamoDB DocClient, S3, Twilio SDKs, repositories, and an in-process matchmaking worker consuming Redis queue jobs.
- **Match Processor (`base/apps/match-processor`)**  
  Headless loop that scans active matches, pulls live quotes from TwelveData, and patches DynamoDB with current prices. Uses shared utils (`wage-shared`) for sleep helpers.
- **Shared Package (`base/packages/wage-shared`)**  
  Cross-service convenience utilities (sleep, IDs, formatting, regex constants). Compiled as tsconfig project reference.
- **Mobile App (`wage-expo`)**  
  Not analysed in depth in this pass, but depends on the API contract described above.

## 3. Data & State
- **DynamoDB (`WageTable`)**  
  Match state, portfolios, invites, perks, etc. Runtime now dual-writes both `pk/sk` and `PK/SK` so existing lowercase tables remain compatible while we migrate infra. Terraform still provisions lowercase keys; converge on a single schema once deployments are stable. Repositories read the table name from config and only fall back to `"WageTable"` as a last resort.
- **Redis (ElastiCache)**  
  Primary coordination layer. Used for matchmaking queue (`zset` + Lua script), player/connection metadata, Redis pub/sub for WebSocket fan-out, job queue list for the in-process worker, and research ticker subscriptions.
- **S3**  
  Profile images (see `s3.tf`). No direct code review in this pass.
- **SQS / Step Functions**  
  Terraform provisions queues and a settlement state machine, but runtime code now expects long-lived Fargate processors. Reconcile infra-as-code with latest runtime design.

## 4. Workflows
- **Matchmaking**  
  1. Mobile client opens Fastify WebSocket (`/match-gateway/ws`).  
  2. `join_matchmaking` -> Redis multi transaction stores connection, pushes job to queue list.  
  3. In-process worker (`startMatchmakingWorker`) BRPOPs jobs, matches players (Lua script ensures atomic pairing).  
  4. `createMatch` seeds Redis + DynamoDB, sets 2-min asset selection window, notifies players over Redis pub/sub.  
  5. Players select up to 3 assets; ready check transitions match to `in_progress` after fetching initial quotes.  
  6. Ongoing pricing: the Fargate match processor loop polls TwelveData, while the scheduled `price-oracle` Lambda writes fresh prices into DynamoDB and a DynamoDB Stream triggers `on-price-updated` to fan the new values into live matches.
- **Research WebSocket (`/research-ws/:ticker`)**  
  Lightweight fan-out managed entirely in-memory per task with Redis sets for ticker backpressure.

## 5. Infrastructure Footprint
- **ECS**  
  Terraform defines `backend_service` on Fargate behind ALB (`/health` check). Separate task definition JSONs exist under repo root for manual registration; they target `us-east-2` and Secrets Manager. Ensure IaC + JSON definitions converge (region, env vars, secrets).
- **API Gateway + Lambda (legacy)**  
  Terraform still provisions WebSocket API -> Lambda (placeholder zip). Runtime no longer deploys this Lambda; Fastify handles sockets locally. Decide whether to remove IaC or reintroduce API Gateway with proper integration pattern (see section 8).
- **DynamoDB/Step Functions**  
  IaC uses lowercase key names and different sort keys (`METADATA`) than code expects (`DETAILS`). Update whichever side is authoritative before running `terraform apply`.
- **ElastiCache**  
  TLS optional via `REDIS_TLS_REJECT_UNAUTHORIZED`. Current helper coerces any non-`"false"` string to `true`; documentation should call this out.

## 6. Identified Inconsistencies & Risks
- **Table name & schema drift**  
  - Most repositories now honour `fastify.config.WAGE_TABLE_NAME` / `DYNAMODB_TABLE_NAME`, but helper scripts still fall back to `'WageTable'`; align IaC + env so the default is never relied on.  
  - Terraform creates `${project}-main-${env}` with lowercase `pk`/`sk`; settlement + price stream handlers dual-write both casings today. Pick a single schema once deployments stabilise.  
  - Risk: staging/prod deploys fail or silently fork data models if infra and runtime diverge.
- **Redis client lifecycle**  
  - Helper now wraps the ESM default correctly, but the matchmaking worker still creates its own long-lived client; wire process signal handlers back in so tasks exit cleanly.  
  - Review total Redis connections per task (Fastify plugin + pub/sub + worker) before scaling out.
- **WebSocket scaling**  
  - Connection maps are in-memory per task; Redis only stores `player:{id}` -> connectionId. On disconnect, Redis cleanup never happens, leaving stale connection IDs.  
  - No cross-task delivery guarantee: pub/sub receivers ignore messages when connection lives elsewhere.  
  - Redis-based fan-out + ALB WebSockets works, but needs connection registry service (e.g., store connection -> taskId, forward via Redis streams/SQS).
- **Matchmaking queue operations**  
  - Job processing BRPOPs from list but never deletes player Redis hash when match completes.  
  - Asset selection window (2 min) and match duration (30s) are hard-coded; Step Functions still assumes time-based settlement but not invoked.
- **Match processor vs infra**  
  - Terraform still provisions Lambda + SQS; runtime uses polling worker. Ensure SQS queue is either removed or workers consume it.  
  - `fetchCurrentPrices` relies on TwelveData multi-symbol endpoint returning object map; some responses return `{symbol: {price: '...'}}` or nested `status` keys. Add validation/fallback before production use.
- **Region configuration**  
  - Task definition JSON points to `us-east-2`; Terraform defaults to `us-east-1`. Unify to avoid cross-region resource references.
- **Secrets management**  
  - Task definitions use Secrets Manager; Terraform environment vars hard-code values. Standardise on Secrets Manager + SSM parameters via task definition.
- **API Gateway cleanup**  
  - With Fastify WebSockets, API Gateway WebSocket resources become dead cost/resources unless repurposed.

## 7. Recommended Refactors & Best-Practice Alignment
1. **Single source of truth for infrastructure**  
   - Decide between Terraform or manual task definitions; remove the other.  
   - Parameterise DynamoDB table name/casing and propagate via env + shared config util.  
   - Update Step Functions definition to match real schema or disable until settlement flow is implemented.
2. **Redis connection lifecycle**  
   - Patch `createRedisClient`; reuse Fastify-provided Redis instance where possible.  
   - Subscribe using a single dedicated connection per task; ensure graceful shutdown hooks close clients.
3. **WebSocket architecture**  
   - Option A: Stick with ALB + Fastify WebSockets. Add Redis-backed connection registry (`connectionId -> taskInstanceId`), and publish messages with task affinity (e.g., `WEBSOCKET_OUTGOING_CHANNEL:${taskId}`).  
   - Option B: Move to API Gateway WebSocket + Lambda (or ECS service via HTTP integration). Would offload connection management but reintroduces Lambda complexity. Given need for tight integration with matchmaking state and Twilio auth, staying on ECS is reasonable if we harden the fan-out layer.  
   - Regardless, store user-connection mapping with TTL and clean up on disconnect.
4. **Matchmaking reliability**  
   - Add background sweeper to prune matchmaking queue entries for disconnected players.  
   - Persist queue events to Redis streams or SQS for observability & replay.  
   - Extract match creation + notification into idempotent workflow (SQS -> worker -> DynamoDB -> publish).
5. **Pricing pipeline**  
   - Implement batching strategy and fallback data source; rate-limit TwelveData requests.  
   - Persist last fetch timestamp to avoid redundant scans.  
   - Consider storing per-symbol config (e.g., market hours) in DynamoDB to avoid hard-coded logic.
6. **Configuration management**  
   - Surface all environment requirements in `.env.example` and documentation.  
   - Convert `REDIS_TLS_REJECT_UNAUTHORIZED` to boolean parsing that accepts `true/false/1/0`.  
   - Provide local stack scripts (Docker Compose) for Redis + Dynamo via LocalStack.
7. **Observability**  
   - Enable structured logging (Fastify pino) with request IDs.  
   - Ship match lifecycle metrics to CloudWatch (queue depth, matches created, websocket delivery success).

## 8. Fargate vs Lambda Discussion
- **API & WebSockets**: Fargate offers long-lived compute needed for matchmaking workers and WS fan-out. Lambda struggles with connection affinity and warm-up times for WebSockets; ALB + Fargate is the more conventional architecture here.  
- **Match Processor**: Continuous polling loop is better suited for ECS service or AWS Batch/Step Functions. Lambda + SQS would require event scheduling and still need DynamoDB streaming for settlements.  
- **Recommendation**: Stay on Fargate for both `api` and `match-processor`, but finish decommissioning Lambda resources (SQS triggers, placeholder artifacts) to avoid confusion. Use Lambda only for event-driven, bursty workloads (e.g., settlement triggered by DynamoDB Streams) if still desired.

## 9. API Gateway Strategy
- Current IaC deploys a WebSocket API hooked to a placeholder Lambda. Since Fastify already exposes WebSockets, either:  
  - Retire the API Gateway stack (simplest).  
  - Or migrate Fastify WS logic into Lambda handlers that use `@aws-sdk/client-apigatewaymanagementapi` to post messages. This demands stateless connection storage (DynamoDB/Redis) and replayable queues.  
- If HTTP APIs or mobile push needs require API Gateway (throttling, WAF), place Gateway in front of ALB (HTTP integration) while keeping WebSockets on Fastify, or use separate domain names to avoid cross-protocol confusion.

## 10. Deployment Runbook (recommended future state)
1. Update Terraform to reflect authoritative architecture (remove Lambda-only pieces, align regions, add ECS service for match processor).  
2. Introduce CI pipeline to build/push Docker images, run `terraform plan`, and deploy via GitHub Actions/AWS CodeBuild.  
3. During deploy:  
   - Build workspace packages (`npm run build --workspaces`).  
   - Push images to ECR (`api`, `match-processor`).  
   - Run Terraform apply with consistent `tfvars`.  
   - Run post-deploy smoke tests (`/health`, matchmaking join/leave).  
4. Rotate TwelveData/Twilio secrets via Secrets Manager with tasks referencing new ARNs automatically.  
5. Document rollback plan (scale down service, redeploy previous task definition).

## 11. Open Questions / Items Needing Clarification
- Should settlement still use Step Functions, or move to worker-based cron once match end rules mature?  
- Mobile client contracts for WebSocket payloads—confirm versioning strategy.  
- Market data licensing/compliance (TwelveData free tier rate limits?)—plan for caching.  
- Need for real-time portfolio valuation vs periodic snapshots (affects processor frequency and infra cost).

## 12. Next Steps Checklist
1. Align DynamoDB naming: update repositories to use `fastify.config.WAGE_TABLE_NAME` and convert IaC to uppercase keys (or vice versa).  
2. Fix Redis client factory and add disconnect handling.  
3. Decide on WebSocket hosting model; implement connection cleanup + fan-out strategy.  
4. Update Terraform to remove obsolete Lambda/SQS resources or hook them into new workflow.  
5. Create `.env.example` capturing required vars for `api` and `match-processor`.  
6. Add automated tests (unit/integration) for matchmaking repository, match start flow, and match processor price parsing.  
7. Schedule technical spike on settlement orchestration and asset pricing resilience.

---
This documentation should act as the new source of truth for engineering, DevOps, and product discussions around the Wage backend platform. Update alongside architectural changes to keep drift at bay.
