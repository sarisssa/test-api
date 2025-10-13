import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { buyPerk, getAllPerks } from '../services/perk.js';
import {
  BuyPerkBody,
  buyPerkJsonSchema,
  buyPerkResponseJsonSchema,
  perksResponseJsonSchema,
} from '../types/perk.js';

export default async function perkRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['perks'],
        description: 'Get all available perks',
        response: {
          200: perksResponseJsonSchema,
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const perks = await getAllPerks(fastify);

        const sortedPerks = perks.sort((a, b) => {
          if (a.minimumPlayerTier !== b.minimumPlayerTier) {
            return a.minimumPlayerTier - b.minimumPlayerTier;
          }
          return a.name.localeCompare(b.name);
        });

        return {
          perks: sortedPerks.map(perk => ({
            id: perk.pk.replace('PERK#', ''),
            name: perk.name,
            chipsCost: perk.chipsCost,
            class: perk.class,
            minimumPlayerTier: perk.minimumPlayerTier,
            description: perk.description,
          })),
          count: sortedPerks.length,
        };
      } catch (error) {
        fastify.log.error({
          error,
          msg: 'Error in GET /perks endpoint',
        });
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to fetch perks',
        });
      }
    }
  );

  fastify.post<{ Body: BuyPerkBody }>(
    '/buy',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['perks'],
        description: 'Purchase a perk',
        body: buyPerkJsonSchema,
        response: {
          200: buyPerkResponseJsonSchema,
          400: {
            description: 'Invalid request',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const { perkId } = request.body;

      try {
        const result = await buyPerk(fastify, request.user.userId, perkId);

        if (result.newBalance !== undefined) {
          return reply.status(200).send({
            message: result.message,
            newBalance: result.newBalance,
          });
        } else {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: result.message,
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
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to purchase perk',
        });
      }
    }
  );
}
