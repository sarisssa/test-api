import { DynamoDB } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'

const DEFAULT_LOCALSTACK_ENDPOINT = 'http://host.docker.internal:4566'

const resolveRegion = () => process.env.AWS_REGION || process.env.DYNAMODB_REGION || 'us-east-1'

const shouldUseLocalstack =
  process.env.IS_OFFLINE === 'true' ||
  process.env.USE_LOCALSTACK === 'true' ||
  process.env.STAGE === 'local'

const resolveEndpoint = () => {
  if (process.env.DYNAMODB_ENDPOINT) {
    return process.env.DYNAMODB_ENDPOINT
  }
  if (shouldUseLocalstack) {
    return process.env.LOCALSTACK_ENDPOINT || DEFAULT_LOCALSTACK_ENDPOINT
  }
  return undefined
}

const resolvedEndpoint = resolveEndpoint()

export const ddb = DynamoDBDocument.from(
  new DynamoDB({
    region: resolveRegion(),
    ...(resolvedEndpoint && {
      endpoint: resolvedEndpoint,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test'
      }
    })
  }),
  {
    marshallOptions: {
      removeUndefinedValues: true
    }
  }
)
