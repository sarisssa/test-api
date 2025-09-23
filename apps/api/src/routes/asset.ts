import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { findAssets, getAssetByTicker } from '../services/asset.js';
import { AssetType } from '../types/match.js';

export default async function assetRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { search, type, limit } = request.query as {
      search?: string;
      type?: AssetType;
      limit?: number;
    };

    const parsedLimit = limit ? parseInt(limit.toString(), 10) : 20;

    try {
      if (search) {
        return await findAssets(fastify, search, type, parsedLimit);
      }
      return [];
    } catch (error) {
      console.error('Error in /assets endpoint:', error);
      reply.status(500).send({ error: (error as Error).message });
    }
  });

  fastify.get('/:ticker', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };

    try {
      const asset = await getAssetByTicker(fastify, ticker);

      if (asset) {
        return asset;
      } else {
        fastify.log.info(`Asset not found: ${ticker}`);
        reply.status(404).send({ error: 'Asset not found.' });
      }
    } catch (error) {
      console.error(`Error in /assets/${ticker} endpoint:`, error);
      reply.status(500).send({ error: (error as Error).message });
    }
  });

  // Stateless polling endpoint for current price
  fastify.get('/:symbol/price', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };

    try {
      const asset = await getAssetByTicker(fastify, symbol);
      if (!asset) {
        return reply.code(404).send({error: 'Asset not found'});
      }

      // Increment a simple research counter on the asset (best-effort)
      try {
        await fastify.repositories.asset.incrementResearchCounter(asset.AssetType as AssetType, asset.Symbol);
      } catch (counterError) {
        fastify.log.warn({ counterError, symbol }, 'Failed to increment research counter');
      }

      return {
        ticker: asset.Symbol,
        price: asset.currentPrice,
        lastUpdated: asset.lastUpdated,
      };
    } catch (error) {
      fastify.log.error({ error, symbol }, 'Error in GET /assets/:symbol/price');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });
}
