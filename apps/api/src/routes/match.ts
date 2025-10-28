import { FastifyInstance } from 'fastify';
import { matchDetailsSchema } from '../types/match.js';

export default async function matchRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { matchId: string };
  }>(
    '/:matchId',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['match'],
        description: 'Get match details including player assets and match info',
        ...matchDetailsSchema,
      },
    },
    async (request, reply) => {
      const { matchId } = request.params;
      const userId = request.user.userId;

      try {
        const match = await fastify.repositories.match.getMatch(matchId);

        if (!match) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: `Match with ID '${matchId}' not found.`,
          });
        }

        if (!match.players.includes(userId)) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'You do not have access to this match.',
          });
        }

        const players: Record<
          string,
          {
            userId: string;
            assets: Array<{
              ticker: string;
              name: string;
              assetType: string;
              initialPrice: number;
              currentPrice: number | null;
              shares: number;
              lastUpdatedAt: string | null;
            }>;
          }
        > = {};

        for (const [playerId, playerData] of Object.entries(
          match.playerAssets
        )) {
          players[playerId] = {
            userId: playerId,
            assets: playerData.assets.map(asset => ({
              ticker: asset.ticker,
              name: asset.name,
              assetType: asset.assetType,
              initialPrice: asset.initialPrice,
              currentPrice: asset.currentPrice ?? null,
              shares: asset.shares,
              lastUpdatedAt: asset.lastUpdatedAt ?? null,
            })),
          };
        }

        return {
          matchId: match.matchId,
          status: match.status,
          matchEndTime: match.matchTentativeEndTime ?? null,
          players,
        };
      } catch (error) {
        fastify.log.error({
          error,
          matchId,
          userId,
          msg: 'Error in GET /matches/:matchId endpoint',
        });
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: (error as Error).message,
        });
      }
    }
  );
}
