// Using any for stream event type to avoid hard dependency on aws-lambda types at build time
type DynamoDBStreamEvent = any
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

type AssetType = 'STOCK' | 'CRYPTO' | 'COMMODITY'
const TABLE = process.env.WAGE_TABLE_NAME ?? process.env.DYNAMODB_TABLE_NAME ?? 'WageTable'
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    ...(process.env.DYNAMODB_URL ? { endpoint: process.env.DYNAMODB_URL } : {}),
  })
)

const MAP_PK = (symbol: string) => `INPLAY#MAP#${symbol}`

export const handler = async (event: DynamoDBStreamEvent) => {
  for (const rec of event.Records) {
    try {
      if (rec.eventName !== 'MODIFY' || !rec.dynamodb?.Keys) continue
      const pk = rec.dynamodb.Keys.PK?.S
      const sk = rec.dynamodb.Keys.SK?.S
      if (!pk || !sk) continue

      // React to centralized price row updates only
      const isTypeRow = pk.startsWith('ASSET#') && !pk.startsWith('ASSET#MATCH') && sk !== 'PRICE'
      const isPerSymbolRow = pk.startsWith('ASSET#') && sk === 'PRICE'
      if (!isTypeRow && !isPerSymbolRow) continue

      let symbol: string | undefined
      let assetType: AssetType | undefined
      if (isTypeRow) {
        // pk: ASSET#<TYPE>, sk: <SYMBOL>
        assetType = pk.replace('ASSET#', '') as AssetType
        symbol = sk
      } else {
        // pk: ASSET#<SYMBOL>, sk: PRICE; try to read symbol/assetType from image
        symbol = rec.dynamodb.NewImage?.symbol?.S || pk.replace('ASSET#', '')
        assetType = (rec.dynamodb.NewImage?.assetType?.S as AssetType) || undefined
      }
      if (!symbol) continue

      const newPriceAttr = rec.dynamodb.NewImage?.currentPrice
      const newPrice = newPriceAttr?.N ? parseFloat(newPriceAttr.N) : newPriceAttr?.S ? parseFloat(newPriceAttr.S) : undefined
      if (typeof newPrice !== 'number' || Number.isNaN(newPrice)) continue

      // Find matches using this symbol
      const q = await ddb.send(
        new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': MAP_PK(symbol) } })
      )
      const mapItems = q.Items ?? []
      if (mapItems.length === 0) continue

      // Update each match's playerAssets for this symbol only
      await Promise.all(
        mapItems.map(async item => {
          const matchId = (item.SK as string).replace('MATCH#', '')
          const gm = await ddb.send(
            new GetCommand({ TableName: TABLE, Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' } })
          )
          const m = gm.Item as any
          if (!m || m.status !== 'in_progress') return
          let touched = false
          const now = new Date().toISOString()
          const updated = { ...(m.playerAssets || {}) }
          for (const uid of Object.keys(updated)) {
            const sel = updated[uid]
            if (!sel?.assets) continue
            const assets = sel.assets.map((a: any) => {
              if (a.ticker === symbol) {
                touched = true
                return { ...a, currentPrice: newPrice, lastUpdatedAt: now }
              }
              return a
            })
            updated[uid] = { ...sel, assets }
          }
          if (!touched) return
          await ddb.send(
            new UpdateCommand({
              TableName: TABLE,
              Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' },
              UpdateExpression: 'SET playerAssets = :pa',
              ExpressionAttributeValues: { ':pa': updated },
            })
          )
        })
      )
    } catch (err) {
      console.error('on-price-updated error', err)
    }
  }
}
