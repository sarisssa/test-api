import {
  DynamoDBClient
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocument, PutCommand } from '@aws-sdk/lib-dynamodb'

type Args = {
  ticker: string
  assetType: 'STOCK' | 'CRYPTO' | 'COMMODITY'
  price?: number
  name?: string
}

const parseArgs = (): Args => {
  const args = process.argv.slice(2)
  const out: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = args[i + 1]
      if (val && !val.startsWith('--')) {
        out[key] = val
        i += 1
      } else {
        out[key] = 'true'
      }
    }
  }

  const ticker = out.ticker
  const assetType = out.assetType as Args['assetType']
  const price = out.price ? Number(out.price) : undefined
  const name = out.name

  if (!ticker || !assetType) {
    console.error('Usage: --ticker <SYMBOL> --assetType <STOCK|CRYPTO|COMMODITY> [--price 123.45] [--name "Name"]')
    process.exit(2)
  }

  return { ticker, assetType, price, name }
}

async function main() {
  const { ticker, assetType, price, name } = parseArgs()

  const client = new DynamoDBClient({
    region: process.env.DYNAMODB_REGION || 'us-east-1',
    endpoint: process.env.DYNAMODB_URL || 'http://localhost:4566',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test'
    }
  })
  const ddb = DynamoDBDocument.from(client)

  const now = new Date().toISOString()
  const item = {
    PK: `ASSET#${assetType}`,
    SK: ticker,
    EntityType: 'Asset',
    AssetType: assetType,
    Symbol: ticker,
    name: name || ticker,
    currentPrice: price ?? 0,
    lastUpdated: now
  }

  await ddb.send(new PutCommand({ TableName: 'WageTable', Item: item }))
  console.log('Inserted asset:', item)
}

main().catch((err) => {
  console.error('Failed to insert asset', err)
  process.exit(1)
})

