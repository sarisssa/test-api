import { FastifyInstance } from 'fastify';
import { MatchmakingJob, MatchResult } from '../types/matchmaking.js';
import {
  notifyPlayersOfMatch,
  startWebSocketMessageSubscriber,
} from './connection-manager.js';
import { createMatch } from './match.js';

export const initMatchmaking = async (
  fastify: FastifyInstance
): Promise<void> => {
  await startWebSocketMessageSubscriber(fastify);
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
    const playerAdded =
      await fastify.repositories.matchmaking.addPlayerToMatchmaking(
        userId,
        connectionId
      );

    if (playerAdded) {
      fastify.log.info({
        userId,
        msg: 'Player successfully added to matchmaking',
      });
    } else {
      fastify.log.info({
        userId,
        msg: 'Player was NOT added (already exists or other reason)',
      });
    }

    return playerAdded;
  } catch (error) {
    fastify.log.error({
      error,
      userId,
      msg: 'Error in joinMatchmakingWithSession',
    });
    return false;
  }
};

export const findAndCreateMatch = async (
  fastify: FastifyInstance
): Promise<MatchResult | null> => {
  try {
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const players =
      await fastify.repositories.matchmaking.findMatchablePlayers(matchId);

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
        // TODO: Add rollback operation if match creation fails
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
    const queueSize =
      await fastify.repositories.matchmaking.getMatchmakingQueueSize();

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
    await fastify.repositories.matchmaking.removePlayerFromMatchmaking(
      jobData.userId
    );

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
