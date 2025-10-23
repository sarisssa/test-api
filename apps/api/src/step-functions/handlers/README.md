# Match Settlement Lambda Handlers

Lambda functions invoked by the Match Settlement Step Functions workflow.

## Overview

The settlement workflow consists of:

1. **WaitForMatchEnd** - Wait until `matchTentativeEndTime`
2. **ComputeOutcome** (Lambda) - Calculate winner and portfolio returns
3. **CompleteMatchWithOutcome** (DynamoDB) - Update match with results
4. **AwardPrizes** (Parallel) - Run prize distribution lambdas:
   - BroadcastCompletion (Lambda) - Notify clients via WebSocket
   - AwardXP (Lambda) - Grant experience points
   - AwardCurrency (Lambda) - Award in-game currency
   - NotifyPayments (Lambda) - Trigger payment processing
   - EmitAnalytics (Lambda) - Send analytics events

## Handlers

### compute-outcome.ts

**Purpose:** Compute match outcome after time expires

**Input (from Step Functions):**

```typescript
{
  matchId: string;
  tableName: string;
  matchPk: string; // "MATCH#<matchId>"
  matchSk: string; // "DETAILS"
}
```

**Output (to `$.compute.Payload`):**

```typescript
{
  winnerId: string;
  loserId: string;
  finalScores: Record<string, number>; // playerId -> portfolio value
  returns: Record<string, number>; // playerId -> percentage return
  matchEndedAtIso: string; // ISO 8601 timestamp
}
```

**Logic:**

1. Fetch match from DynamoDB
2. Collect all asset tickers from both players
3. Fetch current prices for all tickers from DynamoDB (`ASSET#<ticker>` with sk: `METADATA`)
4. Calculate portfolio total for each player: `Σ(shares × currentPrice)`
5. Calculate percentage returns: `((finalValue - 100000) / 100000) × 100`
6. Determine winner by highest return (tie → lexicographic player ID)

**Environment Variables:**

- `AWS_REGION` (default: `us-east-1`)
- `DYNAMODB_URL` (optional, for LocalStack)
- `WAGE_TABLE_NAME` (default: `WageTable`)

---

### broadcast-completion.ts

**Purpose:** Broadcast `match_completed` event to players via WebSocket

**Input (from Step Functions):**

```typescript
{
  matchId: string;
  winnerId: string;
  loserId: string;
  returns: Record<string, number>;
}
```

**Output:** None (void)

**Logic:**

1. Fetch match from DynamoDB
2. Check idempotency: skip if `matchCompletionBroadcastedAt` exists
3. For each player:
   - Get WebSocket connection ID from Redis (`player:<userId>` hash)
   - Publish message to Redis channel `websocket:outgoing`
4. Mark match as broadcasted (set `matchCompletionBroadcastedAt`)

**Message Format:**

```typescript
{
  type: 'match_completed',
  matchId: string,
  completionReason: string,  // 'time_expired', 'forfeited', etc.
  winnerId: string,
  loserId: string,
  matchEndedAt: string,      // ISO 8601
  finalScores: Record<string, number>
}
```

**Environment Variables:**

- `AWS_REGION` (default: `us-east-1`)
- `DYNAMODB_URL` (optional, for LocalStack)
- `WAGE_TABLE_NAME` (default: `WageTable`)
- `REDIS_URL` (default: `redis://127.0.0.1:6379`)

**Idempotency:** Safe to retry; checks `matchCompletionBroadcastedAt` before broadcasting

---

### award-xp.ts (stub)

**Purpose:** Award experience points to winner

**Input:**

```typescript
{ matchId: string, winnerId: string, loserId: string, returns: Record<string, number> }
```

**TODO:** Implement XP grant logic based on match performance

---

### award-currency.ts (stub)

**Purpose:** Award in-game currency (e.g., coins) to winner

**Input:**

```typescript
{ matchId: string, winnerId: string, loserId: string, returns: Record<string, number> }
```

**TODO:** Implement currency grant logic with idempotency key

---

### notify-payments.ts (stub)

**Purpose:** Trigger real-money payment processing (if applicable)

**Input:**

```typescript
{ matchId: string, winnerId: string, loserId: string, returns: Record<string, number> }
```

**TODO:** Integrate with payment provider API

---

### emit-analytics.ts (stub)

**Purpose:** Send match outcome events to analytics service

**Input:**

```typescript
{ matchId: string, winnerId: string, loserId: string, returns: Record<string, number> }
```

**TODO:** Send events to analytics pipeline (e.g., Segment, Amplitude)

---

## Deployment

### LocalStack (Local Development)

Use the provided deployment script:

```bash
# Deploy all handlers
./apps/api/src/step-functions/deploy-lambdas.sh

# Deploy specific handler
./apps/api/src/step-functions/deploy-lambdas.sh compute-outcome
./apps/api/src/step-functions/deploy-lambdas.sh broadcast-completion
```

The script will:

1. Bundle TypeScript with esbuild
2. Create ZIP packages
3. Deploy to LocalStack (http://localhost:4566)
4. Print ARNs to add to your `.env` file

**Example output:**

```
MATCH_COMPUTE_OUTCOME_FN_ARN=arn:aws:lambda:us-east-1:000000000000:function:match-compute-outcome
MATCH_BROADCAST_COMPLETION_FN_ARN=arn:aws:lambda:us-east-1:000000000000:function:match-broadcast-completion
```

### AWS Production

For production deployment, use your preferred Lambda deployment tool:

**Option 1: AWS SAM**

```yaml
# template.yaml
Resources:
  ComputeOutcomeFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: compute-outcome.handler
      Runtime: nodejs20.x
      CodeUri: ./handlers
      Environment:
        Variables:
          WAGE_TABLE_NAME: !Ref WageTable
```

**Option 2: Terraform**

```hcl
resource "aws_lambda_function" "compute_outcome" {
  function_name = "match-compute-outcome"
  handler       = "compute-outcome.handler"
  runtime       = "nodejs20.x"
  filename      = "compute-outcome.zip"

  environment {
    variables = {
      WAGE_TABLE_NAME = aws_dynamodb_table.wage.name
    }
  }
}
```

**Option 3: Serverless Framework**

```yaml
# serverless.yml
functions:
  computeOutcome:
    handler: handlers/compute-outcome.handler
    environment:
      WAGE_TABLE_NAME: ${self:custom.tableName}
```

---

## Configuration

### Enable Full Workflow

Add Lambda ARNs to `apps/api/.env`:

```bash
# Required for outcome computation
MATCH_COMPUTE_OUTCOME_FN_ARN=arn:aws:lambda:us-east-1:000000000000:function:match-compute-outcome

# Optional prize distribution
MATCH_BROADCAST_COMPLETION_FN_ARN=arn:aws:lambda:us-east-1:000000000000:function:match-broadcast-completion
MATCH_AWARD_XP_FN_ARN=arn:aws:lambda:us-east-1:000000000000:function:match-award-xp
MATCH_AWARD_CURRENCY_FN_ARN=arn:aws:lambda:us-east-1:000000000000:function:match-award-currency
MATCH_NOTIFY_PAYMENTS_FN_ARN=arn:aws:lambda:us-east-1:000000000000:function:match-notify-payments
MATCH_EMIT_ANALYTICS_FN_ARN=arn:aws:lambda:us-east-1:000000000000:function:match-emit-analytics
```

### Recreate Step Functions State Machine

After updating ARNs, recreate the state machine:

```bash
npm run setup:step-functions -w api
```

---

## Testing

### Unit Tests

```bash
# Test compute-outcome logic
npm test -- compute-outcome.test.ts

# Test broadcast-completion idempotency
npm test -- broadcast-completion.test.ts
```

### Integration Tests (LocalStack)

```bash
# 1. Start LocalStack
docker-compose up -d localstack

# 2. Deploy handlers
./apps/api/src/step-functions/deploy-lambdas.sh

# 3. Run integration tests
npm run test:integration -w api
```

### Manual Testing

Invoke Lambda directly:

```bash
aws lambda invoke \
  --function-name match-compute-outcome \
  --payload '{"matchId":"test-123","tableName":"WageTable","matchPk":"MATCH#test-123","matchSk":"DETAILS"}' \
  --endpoint-url http://localhost:4566 \
  response.json

cat response.json
```

---

## Error Handling

### Retry Configuration

All Lambdas use exponential backoff:

- **ComputeOutcome**: 2 retries, 2s → 4s
- **AwardPrizes branches**: 3 retries, 2s → 4s → 8s

### Conditional Check Failures

If the match is already completed (e.g., forfeit), the DynamoDB update will fail with `ConditionalCheckFailedException` and route to the `MatchAlreadyCompleted` (Succeed) state. This is expected and safe.

### Idempotency

- **BroadcastCompletion**: Uses `matchCompletionBroadcastedAt` timestamp
- **AwardXP/Currency**: Should use `matchId` as idempotency key in implementation
- **NotifyPayments**: Must implement idempotency via payment provider API

---

## Monitoring

### CloudWatch Logs

Lambda logs are available in CloudWatch Logs:

- `/aws/lambda/match-compute-outcome`
- `/aws/lambda/match-broadcast-completion`

### Metrics

Key metrics to monitor:

- Lambda duration (should be < 5s for compute-outcome)
- Lambda error rate (should be < 1%)
- DynamoDB `ConditionalCheckFailedException` rate (indicates forfeits)

### Alarms

Set CloudWatch alarms for:

- Lambda errors > 5 in 5 minutes
- Lambda duration > 10 seconds
- Step Functions execution failures

---

## Migration from Settlement Worker

The settlement worker (`apps/api/src/services/settlement-worker.ts`) is being phased out in favor of Step Functions. Migration plan:

### Phase 1 (Current)

- Keep settlement worker for local development
- Use Step Functions in staging/production
- Both paths coexist peacefully (worker checks `if (!match.winner)` before settling)

### Phase 2

- Add feature flag `USE_SETTLEMENT_WORKER=false` in production `.env`
- Settlement worker disabled; Step Functions handles all settlement

### Phase 3

- Remove settlement worker code entirely once Step Functions proven in production
- Update tests to use Step Functions mocks

**Current Behavior:**

- If Step Functions sets a winner, the settlement worker skips that match
- If a forfeit happens, API completes the match and stops the Step Functions execution
- No double-settlement risk

---

## FAQ

**Q: What if `MATCH_COMPUTE_OUTCOME_FN_ARN` is not set?**

A: The workflow falls back to the simple "CompleteMatch" path, which marks the match as completed without computing a winner. The settlement worker can then pick it up.

**Q: What if only some prize ARNs are configured?**

A: The `AwardPrizes` parallel state only creates branches for configured ARNs. If no ARNs are set, it runs a no-op branch (empty Succeed state).

**Q: How do forfeits interact with Step Functions?**

A: When a player forfeits, the API immediately completes the match with `completionReason='forfeited'` and stops the running Step Functions execution. If the execution still reaches the DynamoDB update, the conditional check fails and routes to `MatchAlreadyCompleted`.

**Q: Can I test this without LocalStack?**

A: No, you need LocalStack or real AWS to run Step Functions. For pure unit tests, mock the Lambda handlers.

**Q: What's the expected match settlement latency?**

A:

- Wait state: 0ms (scheduled by Step Functions)
- ComputeOutcome: ~500ms (DynamoDB queries + price lookups)
- CompleteMatch: ~100ms (single DynamoDB update)
- AwardPrizes (parallel): ~1-2s (Redis publish + idempotency checks)
- **Total: ~2-3 seconds from match end to client notification**

---

## Contributing

When adding new prize handlers:

1. Create handler file: `handlers/<name>.ts`
2. Add ARN to `.env.example`: `MATCH_<NAME>_FN_ARN=`
3. Update `buildMatchSettlementDefinition()` to read the ARN
4. Add branch: `mkBranch('<Name>', <arn>)`
5. Update deploy script with new handler case
6. Add documentation to this README
7. Write tests in `handlers/__tests__/<name>.test.ts`
