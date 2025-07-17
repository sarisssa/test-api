import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import Redis from 'ioredis';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  MATCHMAKING_JOB_QUEUE_LIST,
  MATCHMAKING_PLAYER_QUEUE_ZSET,
  REDIS_KEYS,
} from '../constants.js';
import { MatchmakingJob, MatchResult } from '../types/matchmaking.js';
import {
  notifyPlayersOfMatch,
  startWebSocketMessageSubscriber,
} from './connection-manager.js';
import { createMatch } from './match.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the Lua script
const findAndMatchPlayersScript = readFileSync(
  join(__dirname, '../redis-scripts/find-and-match-players.lua'),
  'utf-8'
);

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

    multi.hset(REDIS_KEYS.PLAYER(userId), {
      connectionId,
      status: 'matchmaking',
      joinedAt: Date.now(),
    });

    //TODO: Determine if this is needed
    multi.hset(REDIS_KEYS.CONNECTION(connectionId), {
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
    // Atomically find and update two oldest players via Lua script
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const players = (await fastify.redis.eval(
      findAndMatchPlayersScript,
      2,
      MATCHMAKING_PLAYER_QUEUE_ZSET, // KEYS[1]
      'player:', // KEYS[2]
      matchId, // ARGV[1]
      'matched' // ARGV[2]
    )) as string[];

    if (players.length === 2) {
      fastify.log.info({
        player1Id: players[0],
        player2Id: players[1],
        msg: 'Creating match between players',
      });

      try {
        const match = await createMatch(fastify, players);

        fastify.log.info({
          matchId: match.matchId,
          players,
          msg: 'Match created successfully',
        });

        return match;
      } catch (error) {
        // TODO: Add another Lua script for rollback operation if match creation fails
        fastify.log.error({
          error,
          players,
          msg: 'Error creating match - players were removed from queue',
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
