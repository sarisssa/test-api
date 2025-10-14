import auth from '@fastify/auth';
import cors from '@fastify/cors';
import fastifyEnv from '@fastify/env';
import jwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import redis from '@fastify/redis';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { FastifyInstance } from 'fastify';
import { envSchema, type Env } from './config/env.js';
import authPlugin from './plugins/auth.js';
import dynamodbPlugin from './plugins/dynamodb.js';
import stepFunctionsPlugin from './plugins/step-functions.js';
import repositoriesPlugin from './plugins/repositories.js';
import s3Plugin from './plugins/s3.js';
import twilioPlugin from './plugins/twilio.js';
import assetRoutes from './routes/asset.js';
import authRoutes from './routes/auth.js';
import friendRoutes from './routes/friends.js';
import healthRoutes from './routes/health.js';
import inviteRoutes from './routes/invites.js';
import matchGatewayRoutes from './routes/match-gateway.js';
import perkRoutes from './routes/perks.js';
import researchWebSocketRoutes from './routes/research-websocket.js';
import userRoutes from './routes/user.js';
import metricsRoutes from './routes/metrics.js';
import { startMatchmakingWorker } from './services/matchmaking-worker.js';
import { initMatchmaking } from './services/matchmaking.js';
import { initializePhoneHashSalt } from './utils/phone-utils.js';
import { buildFastifyRedisOptions } from './utils/redis.js';

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

  if (
    fastify.config.DYNAMODB_TABLE_NAME &&
    (!fastify.config.WAGE_TABLE_NAME || fastify.config.WAGE_TABLE_NAME === 'WageTable')
  ) {
    fastify.config.WAGE_TABLE_NAME = fastify.config.DYNAMODB_TABLE_NAME;
  }

  await fastify.register(cors);
  await fastify.register(jwt, {
    secret: fastify.config.JWT_SECRET,
  });
  await fastify.register(auth);
  await fastify.register(authPlugin);

  await fastify.register(
    redis,
    buildFastifyRedisOptions(fastify.config.REDIS_URL, fastify.config.REDIS_TLS_REJECT_UNAUTHORIZED, {
      closeClient: true,
      connectTimeout: 30_000,
    })
  );

  await fastify.register(dynamodbPlugin);
  await fastify.register(stepFunctionsPlugin);
  await fastify.register(s3Plugin);
  await fastify.register(twilioPlugin);
  await fastify.register(repositoriesPlugin);
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });
  // await initApiGatewayManagementClient(fastify);
  await fastify.register(fastifyWebsocket);
  await startMatchmakingWorker(fastify);
  await initMatchmaking(fastify);

  await fastify.register(healthRoutes);
  await fastify.register(matchGatewayRoutes, { prefix: '/match-gateway' });
  await fastify.register(researchWebSocketRoutes);
  await fastify.register(metricsRoutes);
  await fastify.register(assetRoutes, { prefix: '/assets' });
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(perkRoutes, { prefix: '/perks' });
  await fastify.register(inviteRoutes, { prefix: '/invites' });
  await fastify.register(userRoutes, { prefix: '/user' });
  await fastify.register(friendRoutes, { prefix: '/friends' });

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
