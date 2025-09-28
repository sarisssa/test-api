import { FastifyInstance } from 'fastify'
import {
  handleAssetDeselection,
  handleAssetSelection,
  handleReadyCheck
} from './match.js'
import { joinMatchmakingWithSession } from './matchmaking.js'

export type InboundRequest = {
  action?: string
  payload?: any
  connectionId?: string
  userId?: string
}

export type InboundResponse = {
  ok: boolean
  action?: string
  error?: string
  [key: string]: any
}

export async function handleInboundMessage(
  fastify: FastifyInstance,
  message: InboundRequest
): Promise<InboundResponse> {
  const { action, payload, connectionId, userId } = message

  if (!action) {
    return { ok: false, error: 'missing_action' }
  }

  if (!userId) {
    return { ok: false, error: 'missing_user' }
  }

  try {
    switch (action) {
      case 'join_matchmaking': {
        if (!connectionId) {
          return { ok: false, error: 'missing_connection' }
        }
        const added = await joinMatchmakingWithSession(
          fastify,
          userId,
          connectionId
        )
        return {
          ok: true,
          action,
          playerAddedToQueue: added
        }
      }

      case 'select_asset': {
        const { matchId, ticker } = payload ?? {}
        if (!matchId || !ticker) {
          return {
            ok: false,
            error: 'missing_fields',
            fields: ['matchId', 'ticker']
          }
        }

        await handleAssetSelection(fastify, userId, { matchId, ticker })
        return { ok: true, action, matchId, ticker }
      }

      case 'deselect_asset': {
        const { matchId, ticker } = payload ?? {}
        if (!matchId || !ticker) {
          return {
            ok: false,
            error: 'missing_fields',
            fields: ['matchId', 'ticker']
          }
        }

        await handleAssetDeselection(fastify, userId, { matchId, ticker })
        return { ok: true, action, matchId, ticker }
      }

      case 'ready_check': {
        const { matchId } = payload ?? {}
        if (!matchId) {
          return {
            ok: false,
            error: 'missing_fields',
            fields: ['matchId']
          }
        }

        await handleReadyCheck(fastify, userId, { matchId })
        return { ok: true, action, matchId }
      }

      default:
        return { ok: false, error: 'unknown_action', action }
    }
  } catch (error) {
    fastify.log.error({ error, action, payload, userId, connectionId }, 'WS inbound handler error')
    return { ok: false, error: 'internal_error' }
  }
}
