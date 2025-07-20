import { FastifyInstance } from 'fastify';
import {
  validateAssetSelection,
  validateMatchAccess,
} from '../validators/match-validator.js';
import { broadcastToMatch } from './connection-manager.js';
import {
  addAssetToMatch,
  getMatch,
  removeAssetFromMatch,
  startMatch,
  updatePlayerReadyStatus,
} from './match.js';

export const handleAssetSelection = async (
  fastify: FastifyInstance,
  userId: string,
  payload: { matchId: string; ticker: string }
) => {
  const { matchId, ticker } = payload;

  try {
    const matchData = await getMatch(fastify, matchId);
    const { match } = validateMatchAccess(matchData, userId);

    validateAssetSelection(match, userId, ticker);

    await addAssetToMatch(fastify, matchId, userId, { ticker });

    const updatedMatch = await getMatch(fastify, matchId);

    if (!updatedMatch) {
      throw new Error('Failed to fetch updated match after asset selection');
    }

    await broadcastToMatch(fastify, updatedMatch.matchId, {
      type: 'asset_selection_update',
      matchId: updatedMatch.matchId,
      playerAssets: updatedMatch.playerAssets,
      timestamp: Date.now(),
    });

    return {
      type: 'asset_selection_success',
      matchId: updatedMatch.matchId,
      ticker,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error('Failed to select asset: ' + error.message);
      }
      throw error;
    }
    throw new Error('Unknown error during asset selection');
  }
};

export const handleAssetDeselection = async (
  fastify: FastifyInstance,
  userId: string,
  payload: { matchId: string; ticker: string }
) => {
  const { matchId, ticker } = payload;

  try {
    const matchData = await getMatch(fastify, matchId);
    await validateMatchAccess(matchData, userId);

    await removeAssetFromMatch(fastify, matchId, userId, ticker);

    const updatedMatch = await getMatch(fastify, matchId);

    if (!updatedMatch) {
      throw new Error('Failed to fetch updated match after asset deselection');
    }

    await broadcastToMatch(fastify, updatedMatch.matchId, {
      type: 'asset_deselection_update',
      matchId: updatedMatch.matchId,
      playerAssets: updatedMatch.playerAssets,
      timestamp: Date.now(),
    });

    return {
      type: 'asset_deselection_success',
      matchId: updatedMatch.matchId,
      ticker,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error('Failed to deselect asset: ' + error.message);
      }

      throw error;
    }
    throw new Error('Unknown error during asset deselection');
  }
};
export const handleReadyCheck = async (
  fastify: FastifyInstance,
  userId: string,
  matchId: string
) => {
  try {
    const matchData = await getMatch(fastify, matchId);
    validateMatchAccess(matchData, userId);

    const updatedMatch = await updatePlayerReadyStatus(
      fastify,
      matchId,
      userId
    );

    const bothPlayersReady = Object.values(updatedMatch.playerAssets).every(
      player => player.readyAt
    );

    if (bothPlayersReady) {
      await startMatch(fastify, matchId);
    }

    await broadcastToMatch(fastify, updatedMatch.matchId, {
      type: 'ready_status_update',
      matchId: updatedMatch.matchId,
      playerAssets: updatedMatch.playerAssets,
      status: bothPlayersReady ? 'in_progress' : 'ready_check',
    });

    return {
      type: 'ready_check_success',
      matchId: updatedMatch.matchId,
      bothPlayersReady,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error('Failed to update ready status: ' + error.message);
      }
      throw error;
    }
    throw new Error('Unknown error during ready check');
  }
};
