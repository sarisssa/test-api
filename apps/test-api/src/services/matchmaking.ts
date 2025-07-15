import { FastifyInstance } from 'fastify';

const MATCHMAKING_PLAYER_QUEUE_ZSET = 'matchmaking:players:zset';
const MATCHMAKING_JOB_QUEUE_LIST = 'matchmaking:jobs:list';

export const initQueue = async (fastify: FastifyInstance): Promise<boolean> => {
  try {
    // zadd returns 1 if new elements added, 0 if no new elements added (e.g., with NX and member exists)
    // TODO: Filter out init member from matchmaking logic
    const elementsAddedCount = await fastify.redis.zadd(
      MATCHMAKING_PLAYER_QUEUE_ZSET,
      'NX',
      0,
      'init'
    );
    return elementsAddedCount === 1;
  } catch (error) {
    fastify.log.error('Error initializing matchmaking queue:', error);
    return false;
  }
};

export const initMatchmaking = async (
  fastify: FastifyInstance
): Promise<void> => {
  const success = await initQueue(fastify);
  fastify.log.info(
    `Matchmaking queue initialization: ${success ? 'created' : 'already exists'}`
  );
};

export const joinMatchmakingWithSession = async (
  fastify: FastifyInstance,
  userId: string
): Promise<boolean> => {
  try {
    const timestamp = Date.now();

    const multi = fastify.redis.multi();

    fastify.log.debug({
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

    // Log LPUSH arguments
    fastify.log.debug({
      jobQueueKey: MATCHMAKING_JOB_QUEUE_LIST,
      message: message,
      msg: 'LPUSH arguments',
    });

    multi.lpush(MATCHMAKING_JOB_QUEUE_LIST, message);

    const results = await multi.exec();
    // results will be [zaddResult, lpushResult]
    const zaddResult = results?.[0]?.[1]; // [0] = first command, [1] = result (not error)
    const lpushResult = results?.[1]?.[1]; // [1] = second command, [1] = result (not error)

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
