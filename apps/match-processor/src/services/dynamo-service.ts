import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { Match } from '../types'
import { ddb } from './aws-clients.js'

const WAGE_TABLE_NAME = process.env.WAGE_TABLE_NAME || 'WageTable'

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

  const { Items: matches = [] } = await ddb.scan(scanParams)
  console.log(`DynamoDB scan complete. Found ${matches.length} active matches.`)
  return matches as Match[]
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
  const priceMap: Record<string, number> = {}

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
      if (result.Item && result.Item.currentPrice) {
        priceMap[symbol] = result.Item.currentPrice as number
      }
    } catch (error) {
      console.warn(`Failed to fetch price for ${symbol}:`, error)
    }
  }

  return priceMap
}
