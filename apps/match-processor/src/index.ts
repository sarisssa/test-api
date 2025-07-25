import { DynamoDB } from '@aws-sdk/client-dynamodb'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import { Context, SQSEvent } from 'aws-lambda'

const LOCALSTACK_ENDPOINT = 'http://host.docker.internal:4566'

const ddb = DynamoDBDocument.from(
  new DynamoDB({
    endpoint: LOCALSTACK_ENDPOINT,
    region: 'us-east-1'
  })
)

const sqs = new SQSClient({
  endpoint: LOCALSTACK_ENDPOINT,
  region: 'us-east-1'
})

export const handler = async (event: SQSEvent, context: Context) => {
  try {
    console.log('Attempting DynamoDB scan for active matches...')
    const scanParams = {
      TableName: 'WageTable',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'in_progress'
      }
    }

    const { Items: matches = [] } = await ddb.scan(scanParams)
    console.log(`DynamoDB scan complete. Found ${matches.length} active matches.`)

    if (matches.length > 0) {
      for (const match of matches) {
        console.log(`Processing match: ID=${match.matchId || match.PK}, Status=${match.status}`)
      }
    } else {
      console.log('No active matches found to process in this invocation.')
    }

    const sendMessageParams = {
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({
        source: 'self-invocation',
        timestamp: Date.now()
      }),
      DelaySeconds: 10
    }

    await sqs.send(new SendMessageCommand(sendMessageParams))
    console.log('Successfully scheduled next execution in 10 seconds.')

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Lambda executed successfully with full logic',
        matchesProcessed: matches.length,
        timestamp: new Date().toISOString(),
        nextExecutionScheduled: true
      })
    }
  } catch (error) {
    console.error('Error in lambda execution with full logic:', error) // This often logs message and stack for Error objects
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error in lambda execution with full logic',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}
