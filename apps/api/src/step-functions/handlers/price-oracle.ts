import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

type AssetType = 'STOCK' | 'CRYPTO' | 'COMMODITY'

interface PriceOracleEvent {
  // Optional restriction to a subset of symbols
  symbols?: string[]
}

const TABLE = process.env.WAGE_TABLE_NAME ?? process.env.DYNAMODB_TABLE_NAME ?? 'WageTable'
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    ...(process.env.DYNAMODB_URL ? { endpoint: process.env.DYNAMODB_URL } : {}),
  })
)

const REGISTRY_PK = 'INPLAY#TICKER'

const isPlaceholderKey = (value: string | undefined) => {
  if (!value) return true
  const n = value.trim().toLowerCase()
  return n === '' || n === 'dummy' || n === 'replace-with-real-key'
}

async function listInPlay(): Promise<Array<{ symbol: string; assetType: AssetType }>> {
  const res = await ddb.send(
    new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': REGISTRY_PK } })
  )
  const items = res.Items ?? []
  return items.map(i => ({ symbol: i.symbol as string, assetType: i.assetType as AssetType }))
}

async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) return {}
  const unique = Array.from(new Set(symbols))

  // Stub if no real key
  if (isPlaceholderKey(TWELVE_DATA_API_KEY)) {
    const out: Record<string, number> = {}
    for (const s of unique) {
      const h = s.toUpperCase().split('').reduce((a, c) => a + c.charCodeAt(0), 0)
      out[s] = 20 + (h % 200) + (h % 100) / 100
    }
    return out
  }

  const batches: string[][] = []
  const BATCH_SIZE = 100
  for (let i = 0; i < unique.length; i += BATCH_SIZE) batches.push(unique.slice(i, i + BATCH_SIZE))

  const results: Record<string, number> = {}
  for (const batch of batches) {
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(batch.join(','))}&apikey=${TWELVE_DATA_API_KEY}`
    const resp = await fetch(url)
    if (!resp.ok) {
      console.warn('Twelve Data error', resp.status, await resp.text())
      continue
    }
    const payload = (await resp.json()) as Record<string, any>
    for (const s of batch) {
      const entry = payload?.[s]
      const p = typeof entry?.price === 'string' ? parseFloat(entry.price) : typeof entry?.price === 'number' ? entry.price : undefined
      if (typeof p === 'number' && !Number.isNaN(p)) results[s] = p
    }
  }
  return results
}

async function writePrice(assetType: AssetType, symbol: string, price: number): Promise<void> {
  const now = new Date().toISOString()
  const upperSymbol = symbol.toUpperCase()

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `ASSET#${upperSymbol}`, sk: 'PRICE' },
      UpdateExpression: 'SET currentPrice = :p, lastUpdated = :ts, assetType = :t, symbol = :s',
      ExpressionAttributeValues: { ':p': price, ':ts': now, ':t': assetType, ':s': upperSymbol },
    })
  )
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `ASSET#${upperSymbol}`, sk: 'METADATA' },
      UpdateExpression: 'SET currentPrice = :p, lastUpdated = :ts, AssetType = :t, Symbol = :s',
      ExpressionAttributeValues: { ':p': price, ':ts': now, ':t': assetType, ':s': upperSymbol },
    })
  )
}

export const handler = async (event: PriceOracleEvent): Promise<{ updated: number }> => {
  console.log('PriceOracle invoked', JSON.stringify(event))
  const registry = await listInPlay()
  const filtered = event.symbols && event.symbols.length > 0 ? registry.filter(r => event.symbols!.includes(r.symbol)) : registry
  const symbols = filtered.map(f => f.symbol)
  const priceMap = await fetchPrices(symbols)

  let updated = 0
  await Promise.all(
    filtered.map(async r => {
      const p = priceMap[r.symbol]
      if (typeof p === 'number') {
        await writePrice(r.assetType, r.symbol, p)
        updated += 1
      }
    })
  )

  console.log(`PriceOracle updated ${updated} symbols`)
  return { updated }
}
