import { DynamoDB } from '@aws-sdk/client-dynamodb'
import { SQSClient } from '@aws-sdk/client-sqs'
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'

const DEFAULT_LOCALSTACK_ENDPOINT = 'http://host.docker.internal:4566'
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1'

const shouldUseLocalstack =
  process.env.IS_OFFLINE === 'true' ||
  process.env.USE_LOCALSTACK === 'true' ||
  process.env.STAGE === 'local'

const resolveEndpoint = (explicitEndpoint?: string) =>
  explicitEndpoint || (shouldUseLocalstack ? DEFAULT_LOCALSTACK_ENDPOINT : undefined)

const localCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test'
}

const resolvedDynamoEndpoint = resolveEndpoint(process.env.DYNAMODB_ENDPOINT)
const resolvedSqsEndpoint = resolveEndpoint(process.env.SQS_ENDPOINT)

export const ddb = DynamoDBDocument.from(
  new DynamoDB({
    region: AWS_REGION,
    ...(resolvedDynamoEndpoint && {
      endpoint: resolvedDynamoEndpoint,
      credentials: localCredentials
    })
  }),
  {
    marshallOptions: {
      removeUndefinedValues: true
    }
  }
)

export const sqs = new SQSClient({
  region: AWS_REGION,
  ...(resolvedSqsEndpoint && {
    endpoint: resolvedSqsEndpoint,
    credentials: localCredentials
  })
})
