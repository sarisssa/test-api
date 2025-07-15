import { FastifyInstance } from 'fastify';

const MATCHMAKING_PLAYER_QUEUE_ZSET = 'matchmaking:players:zset';
const MATCHMAKING_JOB_QUEUE_LIST = 'matchmaking:jobs:list';

export const initMatchmaking = async (
  fastify: FastifyInstance
): Promise<void> => {
  // No initialization needed! Redis creates structures automatically.
  fastify.log.info(
    'Matchmaking service initialized - queues will be created on first use'
  );
};

export const joinMatchmakingWithSession = async (
  fastify: FastifyInstance,
  userId: string,
  connectionId: string
): Promise<boolean> => {
  try {
    const timestamp = Date.now();

    //Ensure atomicity of operations
    const multi = fastify.redis.multi();

    multi.hset(`player:${userId}`, {
      connectionId,
      status: 'matchmaking',
      joinedAt: Date.now(),
    });

    multi.hset(`connection:${connectionId}`, {
      userId,
    });

    fastify.log.info({
      queueKey: MATCHMAKING_PLAYER_QUEUE_ZSET,
      nxOption: 'NX',
      score: timestamp,
      member: userId,
      msg: 'ZADD arguments',
    });

    multi.zadd(
      MATCHMAKING_PLAYER_QUEUE_ZSET,
      'NX', // Only add a new player if not already in queue
      timestamp,
      userId
    );

    const message = JSON.stringify({
      userId,
      timestamp,
      action: 'player_joined_matchmaking',
      attempts: 0,
    });

    fastify.log.info({
      jobQueueKey: MATCHMAKING_JOB_QUEUE_LIST,
      message: message,
      msg: 'LPUSH arguments',
    });

    multi.lpush(MATCHMAKING_JOB_QUEUE_LIST, message);
    // results will be [hsetPlayer, hsetConnection, zadd, lpush]
    const results = await multi.exec();

    const zaddResult = results?.[2]?.[1]; // Third command (zadd)
    const lpushResult = results?.[1]?.[1];

    fastify.log.info({
      userId,
      zaddResult: zaddResult,
      lpushResult: lpushResult,
      timestamp,
      queueKey: MATCHMAKING_PLAYER_QUEUE_ZSET,
      jobQueueKey: MATCHMAKING_JOB_QUEUE_LIST,
      fullResults: results,
      msg: 'Redis operation results',
    });

    if (zaddResult === 1) {
      fastify.log.info({
        userId,
        timestamp,
        queueKey: MATCHMAKING_PLAYER_QUEUE_ZSET,
        jobQueueKey: MATCHMAKING_JOB_QUEUE_LIST,
        msg: 'Player successfully added to matchmaking',
      });
      return true;
    } else {
      fastify.log.info({
        userId,
        zaddResult,
        msg: 'Player was NOT added (already exists or other reason)',
      });
      return false;
    }
  } catch (error) {
    fastify.log.error('Error adding player to matchmaking queue:', {
      userId,
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
};
