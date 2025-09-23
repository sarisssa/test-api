import auth from '@fastify/auth';
import cors from '@fastify/cors';
import fastifyEnv from '@fastify/env';
import jwt from '@fastify/jwt';
import redis from '@fastify/redis';
import Fastify, { FastifyInstance } from 'fastify';
import { envSchema, type Env } from './config/env.js';
import dynamodbPlugin from './plugins/dynamodb.js';
import repositoriesPlugin from './plugins/repositories.js';
import twilioPlugin from './plugins/twilio.js';
import assetRoutes from './routes/asset.js';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
// Removed local WebSocket support; use API Gateway instead
import userRoutes from './routes/user.js';
import wsInboundRoutes from './routes/ws-inbound.js';
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
  await startMatchmakingWorker(fastify);
  await initMatchmaking(fastify);

  await fastify.register(healthRoutes);
  // Local WebSocket routes removed in favor of API Gateway managed WebSockets
  await fastify.register(assetRoutes, { prefix: '/assets' });
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(userRoutes, { prefix: '/user' });
  await fastify.register(wsInboundRoutes);

  return fastify;
}

const shutdownSignals = ['SIGINT', 'SIGTERM'] as const;
type ShutdownReason = (typeof shutdownSignals)[number] | 'unhandledRejection' | 'uncaughtException';

const registerProcessEvents = (fastify: FastifyInstance) => {
  let shuttingDown = false;

  const closeGracefully = async (reason: ShutdownReason, exitCode = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    fastify.log.info({ reason }, 'Shutting down gracefully');

    try {
      await fastify.close();
    } catch (closeError) {
      fastify.log.error({ closeError }, 'Error during graceful shutdown');
      exitCode = exitCode || 1;
    } finally {
      process.exit(exitCode);
    }
  };

  shutdownSignals.forEach((signal) => {
    process.once(signal, () => {
      closeGracefully(signal).catch((error) => {
        fastify.log.error({ error, signal }, 'Failed to close gracefully');
        process.exit(1);
      });
    });
  });

  process.on('unhandledRejection', (reason) => {
    fastify.log.error({ reason }, 'Unhandled promise rejection');
    closeGracefully('unhandledRejection', 1).catch(() => process.exit(1));
  });

  process.on('uncaughtException', (error) => {
    fastify.log.error({ error }, 'Uncaught exception');
    closeGracefully('uncaughtException', 1).catch(() => process.exit(1));
  });
};

const start = async () => {
  let fastify: FastifyInstance | null = null;

  try {
    fastify = await buildApp();
    registerProcessEvents(fastify);

    await fastify.listen({
      port: fastify.config.PORT,
      host: fastify.config.HOST,
    });
  } catch (err) {
    fastify?.log.error({ err }, 'Failed to start Fastify instance');
    console.error(err);
    process.exit(1);
  }
};

start();
