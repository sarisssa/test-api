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
}
