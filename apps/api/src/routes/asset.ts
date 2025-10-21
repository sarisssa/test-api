import { FastifyInstance } from 'fastify';
import {
  MONITORED_SYMBOLS_SET,
  TWELVE_DATA_API_BASE_URL,
} from '../constants.js';
import { findAssets, getAssetByTicker } from '../services/asset.js';
import {
  AssetSearchQuery,
  assetSearchQueryJsonSchema,
  GetAssetParams,
  getAssetParamsJsonSchema,
  GetAssetQuery,
  getAssetQueryJsonSchema,
} from '../types/asset.js';
import { AssetType } from '../types/match.js';

export default async function assetRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: AssetSearchQuery;
  }>(
    '/',
    {
      schema: {
        tags: ['assets'],
        description: 'Search for assets',
        querystring: assetSearchQueryJsonSchema,
        response: {
          200: {
            description: 'List of assets matching search criteria',
            type: 'array',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      const { search, type, limit } = request.query;
      const parsedLimit = limit ? parseInt(limit.toString(), 10) : 20;

      try {
        return await findAssets(
          fastify,
          search || '',
          type as AssetType | undefined,
          parsedLimit
        );
      } catch (error) {
        fastify.log.error({
          error,
          search,
          type,
          limit: parsedLimit,
          msg: 'Error in GET /assets endpoint',
        });
        reply.status(500).send({ error: (error as Error).message });
      }
    }
  );

  fastify.get<{
    Params: GetAssetParams;
  }>(
    '/:symbol/price',
    {
      schema: {
        tags: ['assets'],
        description: 'Get current price for an asset',
        params: getAssetParamsJsonSchema,
        response: {
          200: {
            description: 'Current price information',
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              price: { type: 'number' },
              lastUpdated: { type: 'string' },
              source: { type: 'string', enum: ['database', 'live'] },
            },
          },
          404: {
            description: 'Price data not available',
            $ref: 'ErrorResponse#',
          },
          502: {
            description: 'Failed to fetch price data',
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
      const { symbol } = request.params;
      const upperSymbol = symbol.toUpperCase();

      try {
        const isMonitored = await fastify.redis.sismember(
          MONITORED_SYMBOLS_SET,
          upperSymbol
        );

        if (isMonitored) {
          fastify.log.info({
            symbol: upperSymbol,
            msg: 'Symbol is monitored, fetching from database',
          });

          const asset =
            await fastify.repositories.asset.fetchAssetByTickerFromDB(
              upperSymbol
            );

          if (asset && asset.currentPrice && asset.currentPrice > 0) {
            return {
              symbol: upperSymbol,
              price: asset.currentPrice,
              lastUpdated: asset.lastUpdated,
              source: 'database',
            };
          }

          fastify.log.warn({
            symbol: upperSymbol,
            currentPrice: asset?.currentPrice,
            msg: 'Asset found but price is 0 or missing, fetching from API',
          });
        }

        fastify.log.info({
          symbol: upperSymbol,
          isMonitored,
          msg: 'Fetching price from Twelve Data API',
        });

        const response = await fetch(
          `${TWELVE_DATA_API_BASE_URL}/price?symbol=${upperSymbol}&apikey=${fastify.config.TWELVE_DATA_API_KEY}`
        );

        if (!response.ok) {
          fastify.log.error({
            symbol: upperSymbol,
            status: response.status,
            statusText: response.statusText,
            msg: 'Failed to fetch price from Twelve Data',
          });
          return reply.status(502).send({
            error: 'Failed to fetch price data',
            symbol: upperSymbol,
          });
        }

        const priceData = (await response.json()) as {
          price?: string;
          [key: string]: unknown;
        };

        if (!priceData.price) {
          fastify.log.error({
            symbol: upperSymbol,
            priceData,
            msg: 'No price data returned from Twelve Data',
          });
          return reply.status(404).send({
            error: 'Price data not available',
            symbol: upperSymbol,
          });
        }

        const currentPrice = parseFloat(priceData.price);
        const lastUpdated = new Date().toISOString();

        await fastify.redis.sadd(MONITORED_SYMBOLS_SET, upperSymbol);

        try {
          const asset =
            await fastify.repositories.asset.fetchAssetByTickerFromDB(
              upperSymbol
            );
          if (asset) {
            await fastify.repositories.asset.updateAssetPrice(
              upperSymbol,
              asset.AssetType as AssetType,
              currentPrice,
              lastUpdated
            );
            fastify.log.info({
              symbol: upperSymbol,
              price: currentPrice,
              msg: 'Updated asset price in database',
            });
          }
        } catch (updateError) {
          fastify.log.warn({
            symbol: upperSymbol,
            error: updateError,
            msg: 'Failed to update asset price in database, but returning live price',
          });
        }

        fastify.log.info({
          symbol: upperSymbol,
          price: currentPrice,
          msg: 'Successfully fetched and cached price',
        });

        return {
          symbol: upperSymbol,
          price: currentPrice,
          lastUpdated,
          source: 'live',
        };
      } catch (error) {
        fastify.log.error({
          error,
          symbol: upperSymbol,
          msg: 'Error in price endpoint',
        });
        return reply.status(500).send({
          error: 'Internal server error',
          symbol: upperSymbol,
        });
      }
    }
  );

  fastify.get<{
    Params: GetAssetParams;
    Querystring: GetAssetQuery;
  }>(
    '/:symbol',
    {
      schema: {
        tags: ['assets'],
        description: 'Get detailed information about an asset',
        params: getAssetParamsJsonSchema,
        querystring: getAssetQueryJsonSchema,
        response: {
          200: {
            description: 'Asset information',
            type: 'object',
            additionalProperties: true,
          },
          404: {
            description: 'Asset not found',
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
      const { symbol } = request.params;

      try {
        const asset = await getAssetByTicker(fastify, symbol);

        if (asset) {
          return asset;
        }

        fastify.log.info(`Asset not found: ${symbol}`);
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Asset not found.',
        });
      } catch (error) {
        fastify.log.error({
          error,
          symbol,
          msg: 'Error in GET /assets/:symbol endpoint',
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
