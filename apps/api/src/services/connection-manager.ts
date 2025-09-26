import { FastifyInstance } from 'fastify'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { sendToConnection } from 'wage-shared'
import { MatchResult } from '../types/matchmaking.js'

type WsConnection = {
  connectionId: string
  userId: string
  domainName: string
  stage: string
}

const resolveConnectionsTableName = (fastify: FastifyInstance): string => {
  const explicit = process.env.WS_CONNECTIONS_TABLE
  if (explicit && explicit.trim().length > 0) return explicit.trim()

  // Fallbacks for local/dev stages if not specified
  const env = fastify.config.NODE_ENV
  if (env === 'development' || env === 'test') return 'ws-gateway-connections-local'
  return 'ws-gateway-connections-dev'
}

const fetchConnectionsForUsers = async (
  fastify: FastifyInstance,
  userIds: string[]
): Promise<WsConnection[]> => {
  const tableName = resolveConnectionsTableName(fastify)
  const ddb = fastify.dynamodb

  const queries = userIds.map(userId =>
    ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId }
      })
    ).then(r => (r.Items || []) as WsConnection[])
     .catch(err => {
       fastify.log.warn({ err, userId, tableName }, 'Failed to query WS connections')
       return [] as WsConnection[]
     })
  )

  const results = await Promise.all(queries)
  return results.flat()
}

export const broadcastToMatch = async (
  fastify: FastifyInstance,
  matchId: string,
  data: unknown
): Promise<void> => {
  try {
    const match = await fastify.repositories.match.getMatch(matchId)
    if (!match) {
      fastify.log.warn({ matchId }, 'broadcastToMatch: match not found')
      return
    }

    const players = match.players || []
    if (!players.length) return

    const connections = await fetchConnectionsForUsers(fastify, players)
    if (!connections.length) {
      fastify.log.info({ matchId }, 'No active WS connections for match players')
      return
    }

    const sends = connections.map(c =>
      sendToConnection({
        domainName: c.domainName,
        stage: c.stage,
        connectionId: c.connectionId,
        data
      }).catch(err => {
        // Log and continue for transient/gone connections
        fastify.log.warn({ err, connectionId: c.connectionId }, 'WS send failed')
      })
    )

    await Promise.allSettled(sends)
  } catch (err) {
    fastify.log.error({ err, matchId }, 'broadcastToMatch error')
  }
}

export const notifyPlayersOfMatch = async (
  fastify: FastifyInstance,
  match: MatchResult
): Promise<void> => {
  try {
    const connections = await fetchConnectionsForUsers(fastify, match.players)
    if (!connections.length) return

    const payload = {
      type: 'match_found',
      matchId: match.matchId,
      players: match.players
    }

    const sends = connections.map(c =>
      sendToConnection({
        domainName: c.domainName,
        stage: c.stage,
        connectionId: c.connectionId,
        data: payload
      }).catch(err => fastify.log.warn({ err, connectionId: c.connectionId }, 'WS send failed'))
    )

    await Promise.allSettled(sends)
  } catch (err) {
    fastify.log.error({ err, matchId: match.matchId }, 'notifyPlayersOfMatch error')
  }
}

export const startWebSocketMessageSubscriber = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Placeholder: API Gateway-managed WS inbound is handled via HTTP route `/ws/inbound`.
  // No local subscription is required here. This function remains to keep previous init flow stable.
  fastify.log.info('WS message subscriber initialized (no-op)')
}

export default {
  broadcastToMatch,
  notifyPlayersOfMatch,
  startWebSocketMessageSubscriber
}

