import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { FastifyInstance } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    const uptimeInSeconds = process.uptime();
    const redisStatus = fastify.redis.status || 'unknown';

    let dynamoStatus = 'unknown';
    try {
      await fastify.dynamodb.send(
        new DescribeTableCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
        })
      );
      dynamoStatus = 'connected';
    } catch {
      dynamoStatus = 'disconnected';
    }

    return {
      status: 'ok',
      uptime: `${uptimeInSeconds.toFixed(2)} seconds`,
      redis: {
        status: redisStatus,
        url: fastify.config.REDIS_URL,
        connected: fastify.redis.connected,
      },
      dynamodb: {
        status: dynamoStatus,
        region: fastify.config.AWS_REGION,
        table: fastify.config.DYNAMODB_TABLE_NAME,
      },
    };
  });
}
