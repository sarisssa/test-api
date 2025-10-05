import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { buyPerk, getAllPerks, getUserPerks } from '../services/perk.js';

export default async function perkRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const perks = await getAllPerks(fastify);

      const sortedPerks = perks.sort((a, b) => {
        if (a.requiredPlayerTier !== b.requiredPlayerTier) {
          return a.requiredPlayerTier - b.requiredPlayerTier;
        }
        return a.perkName.localeCompare(b.perkName);
      });

      return {
        perks: sortedPerks,
        count: sortedPerks.length,
      };
    } catch (error) {
      fastify.log.error({
        error,
        msg: 'Error in GET /perks endpoint',
      });
      return reply.status(500).send({
        error: 'Failed to fetch perks',
      });
    }
  });

  fastify.get('/user/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };

    try {
      const userPerks = await getUserPerks(fastify, userId);

      return {
        userId,
        perks: userPerks,
        count: userPerks.length,
      };
    } catch (error) {
      fastify.log.error({
        error,
        userId,
        msg: 'Error in GET /perks/user/:userId endpoint',
      });
      return reply.status(500).send({
        error: 'Failed to fetch user perks',
      });
    }
  });

  fastify.post('/buy', async (request, reply) => {
    const { userId, perkId } = request.body as {
      userId: string;
      perkId: string;
    };

    if (!userId || !perkId) {
      return reply.status(400).send({
        error: 'Missing required fields: userId and perkId',
      });
    }

    try {
      const result = await buyPerk(fastify, userId, perkId);

      if (result.success) {
        return reply.status(200).send({
          success: true,
          message: result.message,
          newBalance: result.newBalance,
        });
      } else if (result.reason === 'TIER_REQUIREMENT') {
        return reply.status(409).send({
          success: false,
          error: result.message,
          reason: 'TIER_REQUIREMENT',
        });
      } else if (result.reason === 'INSUFFICIENT_FUNDS') {
        return reply.status(400).send({
          success: false,
          error: result.message,
          reason: 'INSUFFICIENT_FUNDS',
        });
      } else {
        return reply.status(400).send({
          success: false,
          error: result.message,
        });
      }
    } catch (error) {
      fastify.log.error({
        error,
        userId,
        perkId,
        msg: 'Error in POST /perks/buy endpoint',
      });
      return reply.status(500).send({
        error: 'Failed to purchase perk',
      });
    }
  });
}
