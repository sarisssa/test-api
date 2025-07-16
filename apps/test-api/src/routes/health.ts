import { FastifyInstance } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    const uptimeInSeconds = process.uptime();
    const redisStatus = fastify.redis.status || 'unknown';

    return {
      status: 'ok',
      uptime: `${uptimeInSeconds.toFixed(2)} seconds`,
      redis: {
        status: redisStatus,
        url: fastify.config.REDIS_URL,
        connected: fastify.redis.connected,
      },
    };
  });
}
