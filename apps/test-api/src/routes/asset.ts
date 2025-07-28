import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { findAssets, getAssetBySymbol } from '../services/asset.js';
import { AssetType } from '../types/match';

export default async function assetRoutes(fastify: FastifyInstance) {
  fastify.log.info('Asset routes plugin loaded');

  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    fastify.log.info('Assets list endpoint hit');
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

  fastify.get('/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };

    try {
      const asset = await getAssetBySymbol(fastify, symbol);

      if (asset) {
        return asset;
      } else {
        fastify.log.info(`Asset not found: ${symbol}`);
        reply.status(404).send({ error: 'Asset not found.' });
      }
    } catch (error) {
      console.error(`Error in /assets/${symbol} endpoint:`, error);
      reply.status(500).send({ error: (error as Error).message });
    }
  });
}
