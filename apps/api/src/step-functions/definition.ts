export const buildMatchSettlementDefinition = (): string =>
  JSON.stringify({
    Comment:
      'Match Settlement Workflow - waits until match end time and transitions match to completed',
    StartAt: 'WaitForMatchEnd',
    States: {
      WaitForMatchEnd: {
        Type: 'Wait',
        TimestampPath: '$.matchTentativeEndTime',
        Next: 'SettleMatch',
      },
      SettleMatch: {
        Type: 'Task',
        Resource: 'arn:aws:states:::aws-sdk:dynamodb:updateItem',
        Parameters: {
          'TableName.$': '$.tableName',
          Key: {
            PK: {
              'S.$': '$.matchPk',
            },
            SK: {
              'S.$': '$.matchSk',
            },
          },
          UpdateExpression:
            'SET #status = :completed, matchEndedAt = :endTime, completionReason = :reason',
          ConditionExpression: '#status = :inProgress',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':completed': { S: 'completed' },
            ':inProgress': { S: 'in_progress' },
            ':reason': { S: 'time_expired' },
            ':endTime': { 'S.$': '$.matchTentativeEndTime' },
          },
        },
        ResultPath: null,
        End: true,
        Retry: [
          {
            ErrorEquals: ['States.TaskFailed'],
            IntervalSeconds: 2,
            MaxAttempts: 3,
            BackoffRate: 2,
          },
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
    },
  })
