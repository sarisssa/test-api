import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';

type PriceStatusItem = {
  fetchedAt: string;
  matchesProcessed: number;
  tickersProcessed: number;
  cacheHitCount: number;
  cacheMissCount: number;
  fallbackCount: number;
  staleSymbols: string[];
  errorCount: number;
  errors?: Array<{ symbol: string; message: string; source: string }>;
  updatedAt: string;
};

const PRICE_STATUS_PK = 'PRICE_STATUS';
const PRICE_STATUS_SK = 'SUMMARY';

export default async function metricsRoutes(fastify: FastifyInstance) {
  fastify.get('/metrics/prices', async (_request, reply) => {
    try {
      const result = await fastify.dynamodb.send(
        new GetCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          Key: {
            PK: PRICE_STATUS_PK,
            SK: PRICE_STATUS_SK,
          },
        })
      );

      if (!result.Item) {
        return {
          status: 'unknown',
          message: 'No price processor metrics have been recorded yet.',
        };
      }

      const item = result.Item as PriceStatusItem;
      const lastRun = item.fetchedAt;

      const ageMs = Date.now() - new Date(lastRun).getTime();
      const staleThresholdSeconds = Number.parseInt(
        fastify.config.PRICE_STATUS_STALE_THRESHOLD_SECONDS ?? '180',
        10
      );
      const isStale = ageMs > staleThresholdSeconds * 1000;

      if (isStale) {
        fastify.log.warn({
          lastRun,
          ageMs,
          staleThresholdSeconds,
          msg: 'Price data is stale according to configured threshold.',
        });
      }

      const {
        errors,
        errorCount,
        staleSymbols,
        updatedAt,
        ...rest
      } = item;

      return {
        status: isStale ? 'stale' : 'ok',
        lastRunAt: lastRun,
        ageMs,
        errorCount,
        staleSymbols,
        metrics: rest,
        lastUpdatedAt: updatedAt,
        recentErrors: errors ?? [],
      };
    } catch (error) {
      fastify.log.error({
        error,
        msg: 'Failed to read pricing metrics from DynamoDB',
      });
      reply.status(500);
      return { status: 'error', message: 'Failed to load pricing metrics.' };
    }
  });
}
