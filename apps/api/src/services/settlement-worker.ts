import { FastifyInstance } from 'fastify'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBMatchItem } from '../models/match.js'
import { broadcastToMatch } from './connection-manager.js'

let isRunning = false
const LOOP_INTERVAL_MS = 5000

const computeFinalScores = async (
  fastify: FastifyInstance,
  match: DynamoDBMatchItem
): Promise<Record<string, number>> => {
  const tickers = new Set<string>()
  Object.values(match.playerAssets ?? {}).forEach(sel => {
    sel.assets.forEach(a => tickers.add(a.ticker))
  })

  const priceMap: Record<string, number> = {}
  await Promise.all(
    Array.from(tickers).map(async t => {
      const asset = await fastify.repositories.asset.fetchAssetByTickerFromDB(t)
      if (asset && typeof asset.currentPrice === 'number') {
        priceMap[t] = asset.currentPrice
      }
    })
  )

  const totals: Record<string, number> = {}
  for (const playerId of match.players) {
    const selection = match.playerAssets[playerId]
    const total = (selection?.assets ?? []).reduce((sum, asset) => {
      const shares = asset.shares ?? 0
      // Prefer per-match currentPrice (can be manipulated in system-check),
      // then fall back to endPrice, then global asset price, then initialPrice.
      const price =
        asset.currentPrice ?? asset.endPrice ?? priceMap[asset.ticker] ?? asset.initialPrice ?? 0
      return sum + shares * price
    }, 0)
    totals[playerId] = total
  }

  return totals
}

const pickWinner = (totals: Record<string, number>, players: string[]): string => {
  if (players.length === 0) return ''
  if (players.length === 1) return players[0]
  const [a, b] = players
  const aTotal = totals[a] ?? 0
  const bTotal = totals[b] ?? 0
  if (aTotal === bTotal) {
    // deterministic tie-breaker
    return a < b ? a : b
  }
  return aTotal > bTotal ? a : b
}

const finalizeOneMatch = async (fastify: FastifyInstance, match: DynamoDBMatchItem) => {
  try {
    const totals = await computeFinalScores(fastify, match)
    const winner = pickWinner(totals, match.players)
    const loser = match.players.find(p => p !== winner)

    const updated = await fastify.repositories.match.completeMatchWithOutcome(match.matchId, {
      completionReason: 'time_expired',
      matchEndedAtIso: match.matchEndedAt ?? new Date().toISOString(),
      winnerId: winner,
      loserId: loser,
      finalScores: totals,
      expectedStatus: 'completed'
    })

    if (updated) {
      await broadcastToMatch(fastify, updated.matchId, {
        type: 'match_completed',
        matchId: updated.matchId,
        completionReason: 'time_expired',
        winnerId: winner,
        matchEndedAt: updated.matchEndedAt,
        finalScores: updated.finalScores
      })
      fastify.log.info({ matchId: updated.matchId, winner, msg: 'Finalized time-expired match with winner' })
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      // Match mutated concurrently; ignore
      fastify.log.info({ matchId: match.matchId }, 'Settlement skipped: match mutated during finalize')
      return
    }
    fastify.log.error({ error, matchId: match.matchId }, 'Failed to finalize match')
  }
}

const loop = async (fastify: FastifyInstance) => {
  while (isRunning) {
    try {
      const tableName =
        fastify.config.WAGE_TABLE_NAME || fastify.config.DYNAMODB_TABLE_NAME || 'WageTable'
      const { Items } = await fastify.dynamodb.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression:
            '#entity = :entity AND #status = :completed AND attribute_not_exists(#winner) AND #reason = :timeExpired',
          ExpressionAttributeNames: {
            '#entity': 'EntityType',
            '#status': 'status',
            '#winner': 'winner',
            '#reason': 'completionReason'
          },
          ExpressionAttributeValues: {
            ':entity': 'Match',
            ':completed': 'completed',
            ':timeExpired': 'time_expired'
          }
        })
      )

      const matches = (Items ?? []) as DynamoDBMatchItem[]
      for (const m of matches) {
        await finalizeOneMatch(fastify, m)
      }
    } catch (error) {
      fastify.log.error({ error }, 'Settlement worker scan failed')
    }

    await new Promise(res => setTimeout(res, LOOP_INTERVAL_MS))
  }
}

export const startSettlementWorker = async (fastify: FastifyInstance) => {
  if (isRunning) {
    fastify.log.warn('Settlement worker already running')
    return
  }
  isRunning = true
  fastify.log.info('Starting settlement worker...')
  loop(fastify).catch(err => fastify.log.error({ err }, 'Settlement worker crashed'))
}

export const stopSettlementWorker = () => {
  isRunning = false
}
