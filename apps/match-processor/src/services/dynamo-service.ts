import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { Match } from '../types.js'
import { ddb } from './aws-clients.js'

const WAGE_TABLE_NAME = process.env.WAGE_TABLE_NAME || 'WageTable'

export interface AssetPriceRecord {
  currentPrice?: number
  lastUpdated?: string
}

export interface PriceRunMetrics {
  fetchedAt: string
  matchesProcessed: number
  tickersProcessed: number
  cacheHitCount: number
  cacheMissCount: number
  fallbackCount: number
  staleSymbols: string[]
  errors: Array<{ symbol: string; message: string; source: string }>
}

export const getActiveMatches = async (): Promise<Match[]> => {
  console.log('Attempting DynamoDB scan for active matches...')
  const scanParams = {
    TableName: WAGE_TABLE_NAME,
    FilterExpression: '#status = :status',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': 'in_progress'
    }
  }

  try {
    const { Items: matches = [] } = await ddb.scan(scanParams)
    console.log(`DynamoDB scan complete. Found ${matches.length} active matches.`)
    return matches as Match[]
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name: string }).name === 'ResourceNotFoundException'
    ) {
      console.warn(
        `DynamoDB table "${WAGE_TABLE_NAME}" not found. Returning no matches. ` +
          'Run the local table creation script before starting the match processor.'
      )
      return []
    }

    console.error('Failed to scan for active matches:', error)
    throw error
  }
}

export const updateAssetPrice = async (
  assetType: 'STOCK' | 'CRYPTO' | 'COMMODITY',
  symbol: string,
  currentPrice: number
): Promise<void> => {
  try {
    const updateParams = {
      TableName: WAGE_TABLE_NAME,
      Key: {
        PK: `ASSET#${assetType}`,
        SK: symbol
      },
      UpdateExpression: 'SET currentPrice = :price, lastUpdated = :lastUpdated',
      ExpressionAttributeValues: {
        ':price': currentPrice,
        ':lastUpdated': new Date().toISOString()
      }
    }

    await ddb.send(new UpdateCommand(updateParams))
    console.log(`Successfully updated price for ${symbol}: $${currentPrice}`)
  } catch (error) {
    console.error(`Failed to update price for ${symbol}:`, error)
    throw error
  }
}

export const batchUpdateAssetPrices = async (
  priceUpdates: Array<{
    assetType: 'STOCK' | 'CRYPTO' | 'COMMODITY'
    symbol: string
    currentPrice: number
  }>
): Promise<void> => {
  if (priceUpdates.length === 0) {
    console.log('No asset prices to update.')
    return
  }

  console.log(`=== BATCH UPDATING ${priceUpdates.length} ASSET PRICES ===`)

  const updatePromises = priceUpdates.map(async ({ assetType, symbol, currentPrice }) => {
    try {
      const updateParams = {
        TableName: WAGE_TABLE_NAME,
        Key: {
          PK: `ASSET#${assetType}`,
          SK: symbol
        },
        UpdateExpression: 'SET currentPrice = :price, lastUpdated = :lastUpdated',
        ExpressionAttributeValues: {
          ':price': currentPrice,
          ':lastUpdated': new Date().toISOString()
        }
      }

      await ddb.send(new UpdateCommand(updateParams))
      console.log(`Updated ${symbol}: $${currentPrice}`)
    } catch (error) {
      console.error(`Failed to update ${symbol}:`, error)
    }
  })

  await Promise.allSettled(updatePromises)
  console.log(`Completed batch update of ${priceUpdates.length} assets`)
}

export const getAssetPrices = async (
  assets: Array<{ assetType: 'STOCK' | 'CRYPTO' | 'COMMODITY'; symbol: string }>
): Promise<Record<string, number>> => {
  const records = await getAssetPriceRecords(assets)
  const priceMap: Record<string, number> = {}

  for (const [symbol, record] of Object.entries(records)) {
    if (typeof record.currentPrice === 'number') {
      priceMap[symbol] = record.currentPrice
    }
  }

  return priceMap
}

export const getAssetPriceRecords = async (
  assets: Array<{ assetType: 'STOCK' | 'CRYPTO' | 'COMMODITY'; symbol: string }>
): Promise<Record<string, AssetPriceRecord>> => {
  const records: Record<string, AssetPriceRecord> = {}

  for (const { assetType, symbol } of assets) {
    try {
      const getParams = {
        TableName: WAGE_TABLE_NAME,
        Key: {
          PK: `ASSET#${assetType}`,
          SK: symbol
        }
      }

      const result = await ddb.send(new GetCommand(getParams))
      if (result.Item) {
        const { currentPrice, lastUpdated } = result.Item
        records[symbol] = {
          currentPrice: typeof currentPrice === 'number' ? currentPrice : undefined,
          lastUpdated: typeof lastUpdated === 'string' ? lastUpdated : undefined
        }
        continue
      }
    } catch (error) {
      console.warn(`Failed to fetch price for ${symbol}:`, error)
    }
    // ensure record exists even if fetch failed
    records[symbol] = {}
  }

  return records
}

export const recordPriceRunMetrics = async (metrics: PriceRunMetrics): Promise<void> => {
  const params = {
    TableName: WAGE_TABLE_NAME,
    Item: {
      PK: 'PRICE_STATUS',
      SK: 'SUMMARY',
      fetchedAt: metrics.fetchedAt,
      matchesProcessed: metrics.matchesProcessed,
      tickersProcessed: metrics.tickersProcessed,
      cacheHitCount: metrics.cacheHitCount,
      cacheMissCount: metrics.cacheMissCount,
      fallbackCount: metrics.fallbackCount,
      staleSymbols: metrics.staleSymbols,
      errorCount: metrics.errors.length,
      errors: metrics.errors,
      updatedAt: new Date().toISOString()
    }
  }

  try {
    await ddb.send(new PutCommand(params))
    console.log('Persisted price run metrics.')
  } catch (error) {
    console.error('Failed to persist price run metrics:', error)
  }
}

export const updateMatchPlayerAssetPrices = async (
  matchId: string,
  playerAssets: Match['playerAssets']
): Promise<void> => {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: WAGE_TABLE_NAME,
        Key: {
          PK: `MATCH#${matchId}`,
        SK: 'DETAILS'
        },
        UpdateExpression: 'SET playerAssets = :playerAssets',
        ExpressionAttributeValues: {
          ':playerAssets': playerAssets
        }
      })
    )
    console.log(`Updated player asset prices for match ${matchId}`)
  } catch (error) {
    console.error(`Failed to update player assets for match ${matchId}:`, error)
  }
}
