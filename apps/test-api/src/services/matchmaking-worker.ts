import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

const MATCHMAKING_JOB_QUEUE_LIST = 'matchmaking:jobs:list';
const MATCHMAKING_PLAYER_QUEUE_ZSET = 'matchmaking:players:zset';
const WEBSOCKET_OUTGOING_CHANNEL = 'websocket:outgoing_messages';

interface MatchmakingJob {
  userId: string;
  timestamp: number;
  action: 'player_joined_matchmaking' | 'player_cancelled_matchmaking';
  attempts: number;
}

interface MatchResult {
  matchId: string;
  players: string[];
  createdAt: number;
}

let workerRedis: Redis | null = null;
let pubRedis: Redis | null = null;
let isWorkerRunning = false;

export const startMatchmakingWorker = async (fastify: FastifyInstance) => {
  if (isWorkerRunning) {
    fastify.log.warn('Matchmaking worker is already running.');
    return;
  }

  isWorkerRunning = true;
  fastify.log.info('Starting matchmaking worker...');

  // Create dedicated Redis clients for matchmaking and pub/sub
  workerRedis = new Redis(fastify.config.REDIS_URL);
  pubRedis = new Redis(fastify.config.REDIS_URL);

  const shutdown = async () => {
    fastify.log.info('Shutting down matchmaking worker...');
    isWorkerRunning = false;

    if (workerRedis) {
      await workerRedis.quit();
      workerRedis = null;
    }
    if (pubRedis) {
      await pubRedis.quit();
      pubRedis = null;
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

const handlePlayerJoined = async (
  fastify: FastifyInstance,
  jobData: MatchmakingJob
) => {
  try {
    const queueSize = await fastify.redis.zcard(MATCHMAKING_PLAYER_QUEUE_ZSET);

    fastify.log.info({
      userId: jobData.userId,
      queueSize,
      msg: 'Player joined - checking for matches',
    });

    if (queueSize >= 2) {
      await attemptMatchmaking(fastify);
    }
  } catch (error) {
    fastify.log.error({
      error,
      userId: jobData.userId,
      msg: 'Error handling player joined',
    });
  }
};

const handlePlayerCancelled = async (
  fastify: FastifyInstance,
  jobData: MatchmakingJob
) => {
  try {
    // Remove player from queue and cleanup their data
    await fastify.redis.zrem(MATCHMAKING_PLAYER_QUEUE_ZSET, jobData.userId);
    await fastify.redis.hdel(`player:${jobData.userId}`, 'status');

    fastify.log.info({
      userId: jobData.userId,
      msg: 'Player cancelled matchmaking',
    });
  } catch (error) {
    fastify.log.error({
      error,
      userId: jobData.userId,
      msg: 'Error handling player cancellation',
    });
  }
};

const attemptMatchmaking = async (fastify: FastifyInstance) => {
  try {
    const players = await fastify.redis.zrange(
      MATCHMAKING_PLAYER_QUEUE_ZSET,
      0,
      1,
      'WITHSCORES'
    );

    // 2 players + 2 scores
    if (players.length >= 4) {
      const player1Id = players[0];
      const player2Id = players[2];

      fastify.log.info({
        player1Id,
        player2Id,
        msg: 'Creating match between players',
      });

      const match = await createMatch(fastify, [player1Id, player2Id]);

      if (match) {
        // Remove matched players from queue
        await fastify.redis.zrem(
          MATCHMAKING_PLAYER_QUEUE_ZSET,
          player1Id,
          player2Id
        );

        // Notify both players
        await notifyPlayersOfMatch(fastify, match);
      }
    }
  } catch (error) {
    fastify.log.error({
      error,
      msg: 'Error attempting matchmaking',
    });
  }
};

const createMatch = async (
  fastify: FastifyInstance,
  playerIds: string[]
): Promise<MatchResult | null> => {
  try {
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const match: MatchResult = {
      matchId,
      players: playerIds,
      createdAt: Date.now(),
    };

    // Store match data
    await fastify.redis.hset(`match:${matchId}`, {
      players: JSON.stringify(playerIds),
      createdAt: match.createdAt,
      status: 'created',
    });

    // Update player statuses
    for (const playerId of playerIds) {
      await fastify.redis.hset(`player:${playerId}`, {
        status: 'matched',
        matchId: matchId,
      });
    }

    fastify.log.info({
      matchId,
      players: playerIds,
      msg: 'Match created successfully',
    });

    return match;
  } catch (error) {
    fastify.log.error({
      error,
      players: playerIds,
      msg: 'Error creating match',
    });
    return null;
  }
};

const notifyPlayersOfMatch = async (
  fastify: FastifyInstance,
  match: MatchResult
) => {
  if (!pubRedis) {
    fastify.log.error('Pub Redis client not available');
    return;
  }

  for (const playerId of match.players) {
    try {
      // Get player's connection ID
      const connectionId = await fastify.redis.hget(
        `player:${playerId}`,
        'connectionId'
      );

      if (connectionId) {
        const message = {
          targetConnectionId: connectionId,
          data: {
            type: 'match_found',
            matchId: match.matchId,
            players: match.players,
            message: `Match found! Match ID: ${match.matchId}`,
            createdAt: match.createdAt,
          },
        };

        await pubRedis.publish(
          WEBSOCKET_OUTGOING_CHANNEL,
          JSON.stringify(message)
        );

        fastify.log.info({
          playerId,
          connectionId,
          matchId: match.matchId,
          msg: 'Notified player of match',
        });
      } else {
        fastify.log.warn({
          playerId,
          msg: 'Player connection ID not found',
        });
      }
    } catch (error) {
      fastify.log.error({
        error,
        playerId,
        matchId: match.matchId,
        msg: 'Error notifying player of match',
      });
    }
  }
};

export const stopMatchmakingWorker = () => {
  isWorkerRunning = false;
};
