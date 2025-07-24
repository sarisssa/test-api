import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  MATCHMAKING_JOB_QUEUE_LIST,
  MATCHMAKING_PLAYER_QUEUE_ZSET,
  REDIS_KEYS,
} from '../constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the Lua script
const findAndMatchPlayersScript = readFileSync(
  join(__dirname, '../redis-scripts/find-and-match-players.lua'),
  'utf-8'
);

export const createMatchmakingRepository = (fastify: FastifyInstance) => {
  const redis = fastify.redis;
  const { log: logger } = fastify;

  const addPlayerToMatchmaking = async (
    userId: string,
    connectionId: string,
    timestamp: number = Date.now()
  ): Promise<boolean> => {
    try {
      // Ensure atomicity of operations
      const multi = redis.multi();

      // Set player status and connection
      multi.hset(REDIS_KEYS.PLAYER(userId), {
        connectionId,
        status: 'matchmaking',
        joinedAt: timestamp,
      });

      // Set connection to user mapping
      multi.hset(REDIS_KEYS.CONNECTION(connectionId), {
        userId,
      });

      // Add to matchmaking queue with timestamp as score
      multi.zadd(
        MATCHMAKING_PLAYER_QUEUE_ZSET,
        'NX', // Only add if not already in queue
        timestamp,
        userId
      );

      // Add job to process the new player
      const message = JSON.stringify({
        userId,
        timestamp,
        action: 'player_joined_matchmaking',
        attempts: 0,
      });
      multi.lpush(MATCHMAKING_JOB_QUEUE_LIST, message);

      // Execute all commands atomically
      const results = await multi.exec();
      const zaddResult = results?.[2]?.[1]; // Third command (zadd)

      logger.info({
        userId,
        timestamp,
        results,
        msg: 'Matchmaking operations completed',
      });

      return zaddResult === 1;
    } catch (error) {
      logger.error({
        error,
        userId,
        msg: 'Error adding player to matchmaking',
      });
      throw error;
    }
  };

  const removePlayerFromMatchmaking = async (userId: string): Promise<void> => {
    try {
      const multi = redis.multi();

      // Remove from matchmaking queue
      multi.zrem(MATCHMAKING_PLAYER_QUEUE_ZSET, userId);

      // Clear player status
      multi.hdel(REDIS_KEYS.PLAYER(userId), 'status');

      await multi.exec();

      logger.info({
        userId,
        msg: 'Player removed from matchmaking',
      });
    } catch (error) {
      logger.error({
        error,
        userId,
        msg: 'Error removing player from matchmaking',
      });
      throw error;
    }
  };

  const getMatchmakingQueueSize = async (): Promise<number> => {
    try {
      return await redis.zcard(MATCHMAKING_PLAYER_QUEUE_ZSET);
    } catch (error) {
      logger.error({
        error,
        msg: 'Error getting matchmaking queue size',
      });
      throw error;
    }
  };

  const findMatchablePlayers = async (matchId: string): Promise<string[]> => {
    try {
      const players = (await redis.eval(
        findAndMatchPlayersScript,
        2, // Number of keys
        MATCHMAKING_PLAYER_QUEUE_ZSET, // KEYS[1]
        'player:', // KEYS[2]
        matchId, // ARGV[1]
        'matched' // ARGV[2]
      )) as string[];

      if (players.length === 2) {
        logger.info({
          matchId,
          players,
          msg: 'Found matchable players',
        });
      }

      return players;
    } catch (error) {
      logger.error({
        error,
        matchId,
        msg: 'Error finding matchable players',
      });
      throw error;
    }
  };

  const getPlayerMatchmakingStatus = async (
    userId: string
  ): Promise<{ status?: string; joinedAt?: number; connectionId?: string }> => {
    try {
      const status = await redis.hgetall(REDIS_KEYS.PLAYER(userId));
      return status;
    } catch (error) {
      logger.error({
        error,
        userId,
        msg: 'Error getting player matchmaking status',
      });
      throw error;
    }
  };

  return {
    addPlayerToMatchmaking,
    removePlayerFromMatchmaking,
    getMatchmakingQueueSize,
    findMatchablePlayers,
    getPlayerMatchmakingStatus,
  };
};
