import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import Redis from 'ioredis'
type RedisClient = import('ioredis').Redis

/**
 * BroadcastCompletion Lambda Handler
 *
 * Invoked by Step Functions after match completion to broadcast results to clients.
 *
 * Input (from Step Functions):
 *   { matchId, winnerId, loserId, returns }
 *
 * Logic:
 *   1. Check if broadcast already sent (idempotency via matchCompletionBroadcastedAt)
 *   2. Fetch match players from DynamoDB
 *   3. For each player, get their WebSocket connection ID from Redis
 *   4. Publish match_completed message to Redis outgoing channel
 *   5. Mark match as broadcast (set matchCompletionBroadcastedAt)
 */

interface BroadcastCompletionInput {
  matchId: string
  winnerId: string
  loserId: string
  returns: Record<string, number>
}

interface MatchItem {
  matchId: string
  players: string[]
  matchEndedAt?: string
  completionReason?: string
  finalScores?: Record<string, number>
  matchCompletionBroadcastedAt?: string
}

const WEBSOCKET_OUTGOING_CHANNEL = 'websocket:outgoing_messages'

// Initialize clients
const dynamodb = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  ...(process.env.DYNAMODB_URL && { endpoint: process.env.DYNAMODB_URL }),
})

let redisClient: RedisClient | null = null

/**
 * Get or create Redis client
 */
async function getRedisClient(): Promise<RedisClient> {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
    const RedisCtor = Redis as unknown as { new (url: string): RedisClient }
    redisClient = new RedisCtor(redisUrl)
    redisClient.on('error', (err: unknown) => {
      console.error('Redis client error:', err)
    })
    // ioredis connects lazily and queues commands; no explicit connect required
  }

  return redisClient
}

/**
 * Fetch match from DynamoDB
 */
async function fetchMatch(matchId: string): Promise<MatchItem> {
  const tableName = process.env.WAGE_TABLE_NAME ?? 'WageTable'

  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: {
        PK: { S: `MATCH#${matchId}` },
        SK: { S: 'DETAILS' },
      },
    })
  )

  if (!result.Item) {
    throw new Error(`Match not found: ${matchId}`)
  }

  return unmarshall(result.Item) as MatchItem
}

/**
 * Mark match as broadcast (idempotency marker)
 */
async function markMatchBroadcasted(matchId: string): Promise<void> {
  const tableName = process.env.WAGE_TABLE_NAME ?? 'WageTable'
  const now = new Date().toISOString()

  await dynamodb.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: {
        PK: { S: `MATCH#${matchId}` },
        SK: { S: 'DETAILS' },
      },
      UpdateExpression: 'SET matchCompletionBroadcastedAt = :ts',
      ExpressionAttributeValues: {
        ':ts': { S: now },
      },
    })
  )

  console.log(`Marked match ${matchId} as broadcasted at ${now}`)
}

/**
 * Get player's WebSocket connection ID from Redis
 */
async function getPlayerConnectionId(redis: RedisClient, playerId: string): Promise<string | null> {
  try {
    const connectionId = await redis.hget(`player:${playerId}`, 'connectionId')
    return connectionId
  } catch (error) {
    console.warn(`Failed to get connection ID for player ${playerId}:`, error)
    return null
  }
}

/**
 * Broadcast match_completed message to all players
 */
async function broadcastToPlayers(
  redis: RedisClient,
  match: MatchItem,
  winnerId: string,
  loserId: string
): Promise<void> {
  const message = {
    type: 'match_completed',
    matchId: match.matchId,
    completionReason: match.completionReason ?? 'time_expired',
    winnerId,
    loserId,
    matchEndedAt: match.matchEndedAt,
    finalScores: match.finalScores,
  }

  const broadcastPromises = match.players.map(async playerId => {
    try {
      const connectionId = await getPlayerConnectionId(redis, playerId)

      if (!connectionId) {
        console.warn(`No connection ID for player ${playerId}, skipping broadcast`)
        return
      }

      const outgoingMessage = {
        targetConnectionId: connectionId,
        data: message,
      }

      await redis.publish(WEBSOCKET_OUTGOING_CHANNEL, JSON.stringify(outgoingMessage))
      console.log(`Broadcasted to player ${playerId} (connection ${connectionId})`)
    } catch (error) {
      console.error(`Failed to broadcast to player ${playerId}:`, error)
      // Don't throw - best effort broadcast
    }
  })

  await Promise.all(broadcastPromises)
}

/**
 * Lambda handler
 */
export const handler = async (event: BroadcastCompletionInput): Promise<void> => {
  console.log('BroadcastCompletion Lambda invoked:', JSON.stringify(event, null, 2))

  const { matchId, winnerId, loserId } = event

  try {
    // 1. Fetch match
    const match = await fetchMatch(matchId)
    console.log(`Fetched match ${matchId} with ${match.players.length} players`)

    // 2. Idempotency check
    if (match.matchCompletionBroadcastedAt) {
      console.log(`Match ${matchId} already broadcasted at ${match.matchCompletionBroadcastedAt}, skipping`)
      return
    }

    // 3. Connect to Redis
    const redis = await getRedisClient()

    // 4. Broadcast to all players
    await broadcastToPlayers(redis, match, winnerId, loserId)
    console.log(`Broadcasted match_completed for match ${matchId}`)

    // 5. Mark as broadcasted
    await markMatchBroadcasted(matchId)
  } catch (error) {
    console.error('BroadcastCompletion Lambda error:', error)
    throw error
  }
}
