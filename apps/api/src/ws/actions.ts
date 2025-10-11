import { z } from 'zod'
import { FastifyInstance } from 'fastify'

export type ActionContext = {
  fastify: FastifyInstance
  connectionId: string
  userId: string
}

export type ActionResult = {
  ok: boolean
  action: string
  [key: string]: unknown
}

export type ActionHandler<S extends z.ZodTypeAny> = (ctx: ActionContext, payload: z.infer<S>) => Promise<ActionResult>

export type RegisteredAction = {
  schema: z.ZodTypeAny
  handle: ActionHandler<any>
}

// Schemas
const JoinSchema = z.object({})
const SelectAssetSchema = z.object({ matchId: z.string().min(1), ticker: z.string().min(1) })
const DeselectAssetSchema = SelectAssetSchema
const ReadyCheckSchema = z.object({ matchId: z.string().min(1) })

// Handlers wired to existing services
import { joinMatchmakingWithSession } from '../services/matchmaking.js'
import { handleAssetDeselection, handleAssetSelection, handleReadyCheck } from '../services/match.js'

const joinHandler: ActionHandler<typeof JoinSchema> = async ({ fastify, userId, connectionId }) => {
  const added = await joinMatchmakingWithSession(fastify, userId, connectionId)
  return { ok: true, action: 'join_matchmaking', playerAddedToQueue: added }
}

const selectAssetHandler: ActionHandler<typeof SelectAssetSchema> = async ({ fastify, userId }, payload) => {
  await handleAssetSelection(fastify, userId, { matchId: payload.matchId, ticker: payload.ticker })
  return { ok: true, action: 'select_asset', matchId: payload.matchId, ticker: payload.ticker }
}

const deselectAssetHandler: ActionHandler<typeof DeselectAssetSchema> = async ({ fastify, userId }, payload) => {
  await handleAssetDeselection(fastify, userId, { matchId: payload.matchId, ticker: payload.ticker })
  return { ok: true, action: 'deselect_asset', matchId: payload.matchId, ticker: payload.ticker }
}

const readyCheckHandler: ActionHandler<typeof ReadyCheckSchema> = async ({ fastify, userId }, payload) => {
  await handleReadyCheck(fastify, userId, { matchId: payload.matchId })
  return { ok: true, action: 'ready_check', matchId: payload.matchId }
}

// Scaffolds for upcoming actions
const SetMatchDurationSchema = z.object({ matchId: z.string().min(1), durationSeconds: z.number().int().positive() })
const SelectPerkSchema = z.object({ matchId: z.string().min(1), perkId: z.string().min(1) })

const notImplemented = (name: string): ActionHandler<z.ZodTypeAny> => async () => ({ ok: false, action: name, error: 'not_implemented' })

export const actions: Record<string, RegisteredAction> = {
  join_matchmaking: { schema: JoinSchema, handle: joinHandler },
  select_asset: { schema: SelectAssetSchema, handle: selectAssetHandler },
  deselect_asset: { schema: DeselectAssetSchema, handle: deselectAssetHandler },
  ready_check: { schema: ReadyCheckSchema, handle: readyCheckHandler },
  set_match_duration: { schema: SetMatchDurationSchema, handle: notImplemented('set_match_duration') },
  select_perk: { schema: SelectPerkSchema, handle: notImplemented('select_perk') }
}

export const parseAndHandle = async (
  ctx: ActionContext,
  message: unknown
) => {
  const fastify = ctx.fastify
  if (!message || typeof message !== 'object') {
    return { ok: false, error: 'invalid_message' }
  }

  const { action, payload } = message as { action?: string; payload?: unknown }
  if (!action) {
    return { ok: false, error: 'missing_action' }
  }

  const entry = actions[action]
  if (!entry) {
    return { ok: false, error: 'unknown_action', action }
  }

  try {
    const parsed = entry.schema.parse(payload ?? {})
    return await entry.handle(ctx, parsed)
  } catch (err) {
    fastify.log.warn({ err, action }, 'WS action validation failed')
    return { ok: false, error: 'invalid_payload', action }
  }
}

