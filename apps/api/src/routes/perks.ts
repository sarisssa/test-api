import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { buyPerk, getAllPerks, getUserPerks } from '../services/perk.js';
import { BuyPerkBody, buyPerkJsonSchema } from '../types/perk.js';

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

  fastify.get('/my-perks', async (request, reply) => {
    try {
      const userPerks = await getUserPerks(fastify, request.user.userId);

      return {
        perks: userPerks,
        count: userPerks.length,
      };
    } catch (error) {
      fastify.log.error({
        error,
        userId: request.user.userId,
        msg: 'Error in GET /perks/my-perks endpoint',
      });
      return reply.status(500).send({
        error: 'Failed to fetch user perks',
      });
    }
  });

  fastify.post<{ Body: BuyPerkBody }>(
    '/buy',
    {
      schema: {
        body: buyPerkJsonSchema,
      },
    },
    async (request, reply) => {
      const { perkId } = request.body;

      try {
        const result = await buyPerk(fastify, request.user.userId, perkId);

        if (result.success) {
          return reply.status(200).send({
            success: true,
            message: result.message,
            newBalance: result.newBalance,
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
          userId: request.user.userId,
          perkId,
          msg: 'Error in POST /perks/buy endpoint',
        });
        return reply.status(500).send({
          error: 'Failed to purchase perk',
        });
      }
    }
  );
}
