import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import {
  MATCHMAKING_JOB_QUEUE_LIST,
  MATCHMAKING_PLAYER_QUEUE_ZSET,
  WEBSOCKET_OUTGOING_CHANNEL,
} from '../constants.js';
import { MatchmakingJob, MatchResult } from '../types/matchmaking.js';
import { startWebSocketMessageSubscriber } from './connection-manager.js';
import { createMatch } from './match.js';

let pubRedis: Redis | null = null;

const initMatchmakingRedis = async (fastify: FastifyInstance) => {
  if (!pubRedis) {
    pubRedis = new Redis(fastify.config.REDIS_URL);
    fastify.log.info('Initialized Redis pub client for matchmaking');
  }
};

export const cleanupMatchmakingRedis = async () => {
  if (pubRedis) {
    await pubRedis.quit();
    pubRedis = null;
  }
};

export const initMatchmaking = async (
  fastify: FastifyInstance
): Promise<void> => {
  await startWebSocketMessageSubscriber(fastify);
  await initMatchmakingRedis(fastify);

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

export const findAndCreateMatch = async (
  fastify: FastifyInstance
): Promise<MatchResult | null> => {
  try {
    const oldestPlayers = await fastify.redis.zrange(
      MATCHMAKING_PLAYER_QUEUE_ZSET,
      0,
      1,
      'WITHSCORES'
    );

    // 2 players + 2 scores = 4 elements
    if (oldestPlayers.length >= 4) {
      const player1Id = oldestPlayers[0];
      const player2Id = oldestPlayers[2];

      fastify.log.info({
        player1Id,
        player2Id,
        msg: 'Creating match between players',
      });

      try {
        const match = await createMatch(fastify, [player1Id, player2Id]);

        // Update player statuses
        for (const playerId of [player1Id, player2Id]) {
          await fastify.redis.hset(`player:${playerId}`, {
            status: 'matched',
            matchId: match.matchId,
          });
        }

        // Remove matched players from queue
        await fastify.redis.zrem(
          MATCHMAKING_PLAYER_QUEUE_ZSET,
          player1Id,
          player2Id
        );

        fastify.log.info({
          matchId: match.matchId,
          players: [player1Id, player2Id],
          msg: 'Match created successfully',
        });

        return match;
      } catch (error) {
        fastify.log.error({
          error,
          players: [player1Id, player2Id],
          msg: 'Error creating match - players remain in queue',
        });
        return null;
      }
    }

    return null; // Not enough players
  } catch (error) {
    fastify.log.error({
      error,
      msg: 'Error in findAndCreateMatch',
    });
    return null;
  }
};

export const handlePlayerJoined = async (
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
      const match = await findAndCreateMatch(fastify);
      if (match) {
        await notifyPlayersOfMatch(fastify, match);
      }
    }
  } catch (error) {
    fastify.log.error({
      error,
      userId: jobData.userId,
      msg: 'Error handling player joined',
    });
  }
};

export const handlePlayerCancelled = async (
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

export const notifyPlayersOfMatch = async (
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
