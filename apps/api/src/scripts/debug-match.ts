import 'dotenv/config'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'

const matchId = process.argv[2]
if (!matchId) {
  console.error('Usage: tsx src/scripts/debug-match.ts <matchId>')
  process.exit(1)
}

const dynamodb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    endpoint: process.env.DYNAMODB_URL ?? 'http://localhost:4566',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test'
    }
  })
)

const tableName =
  process.env.WAGE_TABLE_NAME ??
  process.env.DYNAMODB_TABLE_NAME ??
  'WageTable'

const run = async () => {
  const response = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: `MATCH#${matchId}`,
        SK: 'DETAILS'
      }
    })
  )

  if (!response.Item) {
    console.error(`Match ${matchId} not found`)
    process.exit(1)
  }

  console.log(JSON.stringify(response.Item, null, 2))
}

run().catch(error => {
  console.error('Failed to fetch match', error)
  process.exit(1)
})
