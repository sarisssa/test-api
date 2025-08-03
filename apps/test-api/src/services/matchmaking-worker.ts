import { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { MATCHMAKING_JOB_QUEUE_LIST } from '../constants.js';
import { MatchmakingJob } from '../types/matchmaking.js';
import { handlePlayerCancelled, handlePlayerJoined } from './matchmaking.js';

let workerRedis: Redis | null = null;
let isWorkerRunning = false;

export const startMatchmakingWorker = async (fastify: FastifyInstance) => {
  if (isWorkerRunning) {
    fastify.log.warn('Matchmaking worker is already running.');
    return;
  }

  isWorkerRunning = true;
  fastify.log.info('Starting matchmaking worker...');

  workerRedis = new Redis(fastify.config.REDIS_URL);

  const shutdown = async () => {
    fastify.log.info('Shutting down matchmaking worker...');
    isWorkerRunning = false;

    if (workerRedis) {
      await workerRedis.quit();
      workerRedis = null;
    }
  };

  // Register shutdown handler
  // process.on('SIGTERM', shutdown);
  // process.on('SIGINT', shutdown);

  // Start the worker loop
  processJobs(fastify);
};

const processJobs = async (fastify: FastifyInstance) => {
  while (isWorkerRunning && workerRedis) {
    try {
      // BRPOP oldest job in queue with 5 second timeout for graceful shutdown
      const job = await workerRedis.brpop(MATCHMAKING_JOB_QUEUE_LIST, 5);

      if (job) {
        const [queueName, messageStr] = job;
        fastify.log.info({
          queueName,
          messageStr,
          msg: 'Received job from queue',
        });

        try {
          const jobData: MatchmakingJob = JSON.parse(messageStr);
          await handleMatchmakingJob(fastify, jobData);
        } catch (parseError) {
          fastify.log.error({
            parseError,
            messageStr,
            msg: 'Failed to parse matchmaking job message',
          });
        }
      }
    } catch (error) {
      if (isWorkerRunning) {
        fastify.log.error({ error, msg: 'Error in matchmaking worker loop' });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  fastify.log.info('Matchmaking worker stopped.');
};

const handleMatchmakingJob = async (
  fastify: FastifyInstance,
  jobData: MatchmakingJob
) => {
  fastify.log.info({ jobData, msg: 'Processing matchmaking job' });

  switch (jobData.action) {
    case 'player_joined_matchmaking':
      await handlePlayerJoined(fastify, jobData);
      break;
    case 'player_cancelled_matchmaking':
      await handlePlayerCancelled(fastify, jobData);
      break;
    default:
      fastify.log.warn({ action: jobData.action, msg: 'Unknown job action' });
  }
};

export const stopMatchmakingWorker = () => {
  isWorkerRunning = false;
};
