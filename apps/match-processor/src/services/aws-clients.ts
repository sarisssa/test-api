import { DynamoDB } from '@aws-sdk/client-dynamodb'
import { SQSClient } from '@aws-sdk/client-sqs'
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'

const LOCALSTACK_ENDPOINT = 'http://host.docker.internal:4566'
const AWS_REGION = process.env.AWS_REGION || 'us-east-1'

export const ddb = DynamoDBDocument.from(
  new DynamoDB({
    endpoint: LOCALSTACK_ENDPOINT,
    region: AWS_REGION
  })
)

export const sqs = new SQSClient({
  endpoint: LOCALSTACK_ENDPOINT,
  region: AWS_REGION
})
