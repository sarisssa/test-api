import { FastifyInstance } from 'fastify';
import { handleAssetDeselection, handleAssetSelection, handleReadyCheck } from '../services/match.js';
import { joinMatchmakingWithSession } from '../services/matchmaking.js';

type InboundRequestBody = {
  action?: string;
  payload?: any;
  connectionId?: string;
  userId?: string; // expected to be set by ws-gateway after JWT verification
  requestContext?: {
    domainName?: string;
    stage?: string;
  };
};

export default async function wsInboundRoutes(fastify: FastifyInstance) {
  fastify.post('/ws/inbound', async (request, reply) => {
    const body = request.body as InboundRequestBody | undefined;

    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ ok: false, error: 'invalid_body' });
    }

    const { action, payload, connectionId, userId } = body;
    if (!action) {
      return reply.code(400).send({ ok: false, error: 'missing_action' });
    }

    // For now we require userId to be provided by the gateway (trusted).
    if (!userId) {
      return reply.code(401).send({ ok: false, error: 'missing_user' });
    }

    try {
      switch (action) {
        case 'join_matchmaking': {
          if (!connectionId) {
            return reply.code(400).send({ ok: false, error: 'missing_connection' });
          }
          const added = await joinMatchmakingWithSession(fastify, userId, connectionId);
          return reply.code(200).send({ ok: true, action, playerAddedToQueue: added });
        }

        case 'select_asset': {
          const { matchId, ticker } = payload ?? {};
          if (!matchId || !ticker) {
            return reply.code(400).send({ ok: false, error: 'missing_fields', fields: ['matchId', 'ticker'] });
          }
          await handleAssetSelection(fastify, userId, { matchId, ticker });
          return reply.code(200).send({ ok: true, action, matchId, ticker });
        }

        case 'deselect_asset': {
          const { matchId, ticker } = payload ?? {};
          if (!matchId || !ticker) {
            return reply.code(400).send({ ok: false, error: 'missing_fields', fields: ['matchId', 'ticker'] });
          }
          await handleAssetDeselection(fastify, userId, { matchId, ticker });
          return reply.code(200).send({ ok: true, action, matchId, ticker });
        }

        case 'ready_check': {
          const { matchId } = payload ?? {};
          if (!matchId) {
            return reply.code(400).send({ ok: false, error: 'missing_fields', fields: ['matchId'] });
          }
          await handleReadyCheck(fastify, userId, { matchId });
          return reply.code(200).send({ ok: true, action, matchId });
        }

        default:
          return reply.code(400).send({ ok: false, error: 'unknown_action', action });
      }
    } catch (err) {
      fastify.log.error({ err, action, payload, userId, connectionId }, 'WS inbound handler error');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });
}
