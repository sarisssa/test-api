import { FastifyInstance } from 'fastify';
import { z } from 'zod';

export type ActionContext = {
  fastify: FastifyInstance;
  connectionId: string;
  userId: string;
};

export type ActionResult = {
  ok: boolean;
  action: string;
  [key: string]: unknown;
};

export type ActionHandler<S extends z.ZodTypeAny> = (
  ctx: ActionContext,
  payload: z.infer<S>
) => Promise<ActionResult>;

export type RegisteredAction = {
  schema: z.ZodTypeAny;
  handle: ActionHandler<any>;
};

// Schemas
const JoinSchema = z.object({});
const SelectAssetSchema = z.object({
  matchId: z.string().min(1),
  ticker: z.string().min(1),
});
const DeselectAssetSchema = SelectAssetSchema;
const ReadyCheckSchema = z.object({ matchId: z.string().min(1) });

// Handlers wired to existing services
import {
  handleAssetDeselection,
  handleAssetSelection,
  handleChatMessage,
  handlePlayerForfeit,
  handleReadyCheck,
  handleSetMatchDuration,
} from '../services/match.js';
import { joinMatchmakingWithSession } from '../services/matchmaking.js';

const joinHandler: ActionHandler<typeof JoinSchema> = async ({
  fastify,
  userId,
  connectionId,
}) => {
  const added = await joinMatchmakingWithSession(fastify, userId, connectionId);
  return { ok: true, action: 'join_matchmaking', playerAddedToQueue: added };
};

const selectAssetHandler: ActionHandler<typeof SelectAssetSchema> = async (
  { fastify, userId },
  payload
) => {
  await handleAssetSelection(fastify, userId, {
    matchId: payload.matchId,
    ticker: payload.ticker,
  });
  return {
    ok: true,
    action: 'select_asset',
    matchId: payload.matchId,
    ticker: payload.ticker,
  };
};

const deselectAssetHandler: ActionHandler<typeof DeselectAssetSchema> = async (
  { fastify, userId },
  payload
) => {
  await handleAssetDeselection(fastify, userId, {
    matchId: payload.matchId,
    ticker: payload.ticker,
  });
  return {
    ok: true,
    action: 'deselect_asset',
    matchId: payload.matchId,
    ticker: payload.ticker,
  };
};

const readyCheckHandler: ActionHandler<typeof ReadyCheckSchema> = async (
  { fastify, userId },
  payload
) => {
  await handleReadyCheck(fastify, userId, { matchId: payload.matchId });
  return { ok: true, action: 'ready_check', matchId: payload.matchId };
};

// Scaffolds for upcoming actions
const SetMatchDurationSchema = z.object({
  matchId: z.string().min(1),
  durationSeconds: z.number().int().positive().max(3_600),
});
const SelectPerkSchema = z.object({
  matchId: z.string().min(1),
  perkId: z.string().min(1),
});
const SendChatMessageSchema = z.object({
  matchId: z.string().min(1),
  messageId: z.string().min(1),
});
const ForfeitMatchSchema = z.object({ matchId: z.string().min(1) });

const notImplemented =
  (name: string): ActionHandler<z.ZodTypeAny> =>
  async () => ({ ok: false, action: name, error: 'not_implemented' });

const setMatchDurationHandler: ActionHandler<
  typeof SetMatchDurationSchema
> = async ({ fastify, userId }, payload) => {
  const updatedMatch = await handleSetMatchDuration(fastify, userId, payload);
  return {
    ok: true,
    action: 'set_match_duration',
    matchId: updatedMatch.matchId,
    matchTentativeEndTime: updatedMatch.matchTentativeEndTime,
  };
};

const sendChatMessageHandler: ActionHandler<
  typeof SendChatMessageSchema
> = async ({ fastify, userId }, payload) => {
  await handleChatMessage(fastify, userId, payload);
  return {
    ok: true,
    action: 'send_chat_message',
    matchId: payload.matchId,
    messageId: payload.messageId,
  };
};

const forfeitMatchHandler: ActionHandler<typeof ForfeitMatchSchema> = async (
  { fastify, userId },
  payload
) => {
  await handlePlayerForfeit(fastify, userId, payload);
  return { ok: true, action: 'forfeit_match', matchId: payload.matchId };
};

export const actions: Record<string, RegisteredAction> = {
  join_matchmaking: { schema: JoinSchema, handle: joinHandler },
  select_asset: { schema: SelectAssetSchema, handle: selectAssetHandler },
  deselect_asset: { schema: DeselectAssetSchema, handle: deselectAssetHandler },
  ready_check: { schema: ReadyCheckSchema, handle: readyCheckHandler },
  set_match_duration: {
    schema: SetMatchDurationSchema,
    handle: setMatchDurationHandler,
  },
  select_perk: {
    schema: SelectPerkSchema,
    handle: notImplemented('select_perk'),
  },
  send_chat_message: {
    schema: SendChatMessageSchema,
    handle: sendChatMessageHandler,
  },

  forfeit_match: { schema: ForfeitMatchSchema, handle: forfeitMatchHandler },
};

export const parseAndHandle = async (ctx: ActionContext, message: unknown) => {
  const fastify = ctx.fastify;
  if (!message || typeof message !== 'object') {
    return { ok: false, error: 'invalid_message' };
  }

  const { action, payload } = message as { action?: string; payload?: unknown };
  if (!action) {
    return { ok: false, error: 'missing_action' };
  }

  const entry = actions[action];
  if (!entry) {
    return { ok: false, error: 'unknown_action', action };
  }

  try {
    const parsed = entry.schema.parse(payload ?? {});
    return await entry.handle(ctx, parsed);
  } catch (err) {
    fastify.log.warn({ err, action }, 'WS action validation failed');
    return { ok: false, error: 'invalid_payload', action };
  }
};
