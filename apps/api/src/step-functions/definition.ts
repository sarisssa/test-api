export const buildMatchSettlementDefinition = (): string => {
  const computeOutcomeArn = process.env.MATCH_COMPUTE_OUTCOME_FN_ARN
  const awardXpArn = process.env.MATCH_AWARD_XP_FN_ARN
  const awardCurrencyArn = process.env.MATCH_AWARD_CURRENCY_FN_ARN
  const notifyPaymentsArn = process.env.MATCH_NOTIFY_PAYMENTS_FN_ARN
  const emitAnalyticsArn = process.env.MATCH_EMIT_ANALYTICS_FN_ARN
  const broadcastCompletionArn = process.env.MATCH_BROADCAST_COMPLETION_FN_ARN

  // Base states: Wait then compute outcome (if configured) and complete the match.
  const states: Record<string, unknown> = {
    WaitForMatchEnd: {
      Type: 'Wait',
      TimestampPath: '$.matchTentativeEndTime',
      Next: computeOutcomeArn ? 'ComputeOutcome' : 'CompleteMatch',
    },
    // Default CompleteMatch (used when no compute Lambda is configured)
    CompleteMatch: {
      Type: 'Task',
      Resource: 'arn:aws:states:::aws-sdk:dynamodb:updateItem',
      Parameters: {
        'TableName.$': '$.tableName',
        Key: {
          PK: { 'S.$': '$.matchPk' },
          SK: { 'S.$': '$.matchSk' },
        },
        UpdateExpression:
          'SET #status = :completed, matchEndedAt = :endTime, completionReason = :reason',
        ConditionExpression: '#status = :inProgress',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':completed': { S: 'completed' },
          ':inProgress': { S: 'in_progress' },
          ':reason': { S: 'time_expired' },
          ':endTime': { 'S.$': '$.matchTentativeEndTime' },
        },
      },
      ResultPath: null,
      Next: 'AwardPrizes',
      Retry: [
        { ErrorEquals: ['States.TaskFailed'], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 },
      ],
      Catch: [
        {
          ErrorEquals: ['DynamoDB.ConditionalCheckFailedException'],
          ResultPath: null,
          Next: 'MatchAlreadyCompleted',
        },
      ],
    },
    MatchAlreadyCompleted: {
      Type: 'Succeed',
      Comment: 'Match was already completed (forfeiture or other flow).',
    },
    AwardPrizes: {
      Type: 'Parallel',
      Branches: [] as unknown[],
      ResultPath: null,
      End: true,
    },
  }

  if (computeOutcomeArn) {
    // Invoke Lambda to compute winner and returns
    states.ComputeOutcome = {
      Type: 'Task',
      Resource: 'arn:aws:states:::lambda:invoke',
      Parameters: {
        FunctionName: computeOutcomeArn,
        Payload: {
          'matchId.$': '$.matchId',
          'tableName.$': '$.tableName',
          'matchPk.$': '$.matchPk',
          'matchSk.$': '$.matchSk',
        },
      },
      ResultPath: '$.compute',
      Next: 'CompleteMatchWithOutcome',
      Retry: [
        { ErrorEquals: ['States.TaskFailed'], IntervalSeconds: 2, MaxAttempts: 2, BackoffRate: 2 },
      ],
    }

    states.CompleteMatchWithOutcome = {
      Type: 'Task',
      Resource: 'arn:aws:states:::aws-sdk:dynamodb:updateItem',
      Parameters: {
        'TableName.$': '$.tableName',
        Key: {
          PK: { 'S.$': '$.matchPk' },
          SK: { 'S.$': '$.matchSk' },
        },
        UpdateExpression:
          'SET #status = :completed, matchEndedAt = :endTime, completionReason = :reason, #winner = :winner, #loser = :loser, finalScoresJson = :finalScoresJson, returnsJson = :returnsJson',
        ConditionExpression: '#status = :inProgress',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#winner': 'winner',
          '#loser': 'loser',
        },
        ExpressionAttributeValues: {
          ':completed': { S: 'completed' },
          ':inProgress': { S: 'in_progress' },
          ':reason': { S: 'time_expired' },
          ':endTime': { 'S.$': '$.matchTentativeEndTime' },
          ':winner': { 'S.$': '$.compute.Payload.winnerId' },
          ':loser': { 'S.$': '$.compute.Payload.loserId' },
          ':finalScoresJson': {
            'S.$': 'States.JsonToString($.compute.Payload.finalScores)'
          },
          ':returnsJson': {
            'S.$': 'States.JsonToString($.compute.Payload.returns)'
          },
        },
      },
      ResultPath: null,
      Next: 'AwardPrizes',
      Retry: [
        { ErrorEquals: ['States.TaskFailed'], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 },
      ],
      Catch: [
        {
          ErrorEquals: ['DynamoDB.ConditionalCheckFailedException'],
          ResultPath: null,
          Next: 'MatchAlreadyCompleted',
        },
      ],
    }
  }

  // Build Award branches for each configured Lambda
  const branches: unknown[] = []
  const mkBranch = (name: string, fnArn?: string) => {
    if (!fnArn) return
    branches.push({
      StartAt: name,
      States: {
        [name]: {
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Parameters: {
            FunctionName: fnArn,
            Payload: {
              'matchId.$': '$.matchId',
              'winnerId.$': '$.compute.Payload.winnerId',
              'loserId.$': '$.compute.Payload.loserId',
              'returns.$': '$.compute.Payload.returns',
            },
          },
          ResultPath: null,
          End: true,
          Retry: [
            { ErrorEquals: ['States.TaskFailed'], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 },
          ],
        },
      },
    })
  }

  // Broadcast to clients (requires compute outcome data)
  if (broadcastCompletionArn && computeOutcomeArn) {
    branches.push({
      StartAt: 'BroadcastCompletion',
      States: {
        BroadcastCompletion: {
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Parameters: {
            FunctionName: broadcastCompletionArn,
            Payload: {
              'matchId.$': '$.matchId',
              'winnerId.$': '$.compute.Payload.winnerId',
              'loserId.$': '$.compute.Payload.loserId',
              'returns.$': '$.compute.Payload.returns'
            }
          },
          ResultPath: null,
          End: true,
          Retry: [
            { ErrorEquals: ['States.TaskFailed'], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 },
          ]
        }
      }
    })
  }

  mkBranch('AwardXP', awardXpArn)
  mkBranch('AwardCurrency', awardCurrencyArn)
  mkBranch('NotifyPayments', notifyPaymentsArn)
  mkBranch('EmitAnalytics', emitAnalyticsArn)

  ;(states.AwardPrizes as any).Branches = branches.length > 0 ? branches : [
    {
      StartAt: 'Noop',
      States: { Noop: { Type: 'Succeed' } },
    },
  ]

  const definition = {
    Comment:
      'Match Settlement Workflow: waits for end, computes outcome, completes match, and awards prizes',
    StartAt: 'WaitForMatchEnd',
    States: states,
  }

  return JSON.stringify(definition)
}
