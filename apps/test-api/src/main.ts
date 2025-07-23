import auth from '@fastify/auth';
import cors from '@fastify/cors';
import fastifyEnv from '@fastify/env';
import jwt from '@fastify/jwt';
import redis from '@fastify/redis';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { FastifyInstance } from 'fastify';
import { envSchema, type Env } from './config/env.js';
import dynamodbPlugin from './plugins/dynamodb.js';
import repositoriesPlugin from './plugins/repositories.js';
import twilioPlugin from './plugins/twilio.js';
import assetRoutes from './routes/asset.js';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import matchGatewayRoutes from './routes/match-gateway.js';
import { startMatchmakingWorker } from './services/matchmaking-worker.js';
import { initMatchmaking } from './services/matchmaking.js';
import { initializePhoneHashSalt } from './utils/phone-utils.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Env;
  }
}

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: true,
  });

  await fastify.register(fastifyEnv, {
    schema: envSchema,
    dotenv: true,
  });

  initializePhoneHashSalt(fastify.config.PHONE_HASH_SALT);

  await fastify.register(cors);
  await fastify.register(jwt, {
    secret: fastify.config.JWT_SECRET,
  });
  await fastify.register(auth);

  await fastify.register(redis, {
    url: fastify.config.REDIS_URL,
    closeClient: true,
  });

  await fastify.register(dynamodbPlugin);
  await fastify.register(twilioPlugin);
  await fastify.register(repositoriesPlugin);

  // await initApiGatewayManagementClient(fastify);
  await fastify.register(fastifyWebsocket);
  await startMatchmakingWorker(fastify);
  await initMatchmaking(fastify);

  await fastify.register(healthRoutes);
  await fastify.register(matchGatewayRoutes, { prefix: '/match-gateway' });
  await fastify.register(assetRoutes, { prefix: '/assets' });
  await fastify.register(authRoutes, { prefix: '/auth' });

  return fastify;
}

const start = async () => {
  try {
    const fastify = await buildApp();
    await fastify.listen({
      port: fastify.config.PORT,
      host: fastify.config.HOST,
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
