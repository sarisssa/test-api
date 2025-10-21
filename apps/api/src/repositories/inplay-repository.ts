import { FastifyInstance } from 'fastify'
import { UpdateCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

export type InPlayTickerKey = { assetType: 'STOCK' | 'CRYPTO' | 'COMMODITY'; symbol: string }

const REGISTRY_PK = 'INPLAY#TICKER'
const REGISTRY_SK = (t: InPlayTickerKey) => `${t.assetType}#${t.symbol}`
const MAP_PK = (symbol: string) => `INPLAY#MAP#${symbol}`
const MAP_SK = (matchId: string) => `MATCH#${matchId}`

export const createInPlayRepository = (fastify: FastifyInstance) => {
  const { dynamodb, log: logger } = fastify
  const tableName =
    fastify.config.WAGE_TABLE_NAME || fastify.config.DYNAMODB_TABLE_NAME || 'WageTable'

  const registerTickersForMatch = async (
    matchId: string,
    tickers: InPlayTickerKey[]
  ): Promise<void> => {
    const ops = tickers.map(async t => {
      try {
        await dynamodb.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: REGISTRY_PK, sk: REGISTRY_SK(t) },
            UpdateExpression:
              'SET symbol = :symbol, assetType = :assetType, updatedAt = :now, PK = :legacyPk, SK = :legacySk ADD #count :one',
            ExpressionAttributeNames: { '#count': 'count' },
            ExpressionAttributeValues: {
              ':symbol': t.symbol,
              ':assetType': t.assetType,
              ':now': new Date().toISOString(),
              ':one': 1,
              ':legacyPk': REGISTRY_PK,
              ':legacySk': REGISTRY_SK(t),
            },
          })
        )

        await dynamodb.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              pk: MAP_PK(t.symbol),
              sk: MAP_SK(matchId),
              PK: MAP_PK(t.symbol),
              SK: MAP_SK(matchId),
              symbol: t.symbol,
              assetType: t.assetType,
              matchId,
              createdAt: new Date().toISOString(),
            },
          })
        )
      } catch (error) {
        logger.error({ error, matchId, symbol: t.symbol, msg: 'registerTickersForMatch failed' })
      }
    })

    await Promise.all(ops)
  }

  const deregisterTickersForMatch = async (
    matchId: string,
    tickers: InPlayTickerKey[]
  ): Promise<void> => {
    const ops = tickers.map(async t => {
      try {
        await dynamodb.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: REGISTRY_PK, sk: REGISTRY_SK(t) },
            UpdateExpression:
              'SET updatedAt = :now, PK = :legacyPk, SK = :legacySk ADD #count :negOne',
            ExpressionAttributeNames: { '#count': 'count' },
            ExpressionAttributeValues: {
              ':now': new Date().toISOString(),
              ':negOne': -1,
              ':legacyPk': REGISTRY_PK,
              ':legacySk': REGISTRY_SK(t),
            },
          })
        )

        await dynamodb.send(
          new DeleteCommand({
            TableName: tableName,
            Key: { pk: MAP_PK(t.symbol), sk: MAP_SK(matchId) },
          })
        )
      } catch (error) {
        logger.warn({ error, matchId, symbol: t.symbol, msg: 'deregisterTickersForMatch failed' })
      }
    })

    await Promise.all(ops)
  }

  const listInPlayTickers = async (): Promise<InPlayTickerKey[]> => {
    try {
      const result = await dynamodb.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': REGISTRY_PK },
        })
      )
      const items = result.Items || []
      return items.map(i => ({ assetType: i.assetType as any, symbol: i.symbol as string }))
    } catch (error) {
      logger.error({ error, msg: 'listInPlayTickers failed' })
      return []
    }
  }

  const listMatchesForSymbol = async (symbol: string): Promise<string[]> => {
    try {
      const result = await dynamodb.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': MAP_PK(symbol) },
          ProjectionExpression: 'sk, SK',
        })
      )
      const items = result.Items || []
      return items
        .map(i => (i.sk ?? i.SK) as string | undefined)
        .filter((val): val is string => typeof val === 'string')
        .map(val => val.replace('MATCH#', ''))
    } catch (error) {
      logger.error({ error, symbol, msg: 'listMatchesForSymbol failed' })
      return []
    }
  }

  return {
    registerTickersForMatch,
    deregisterTickersForMatch,
    listInPlayTickers,
    listMatchesForSymbol,
  }
}
