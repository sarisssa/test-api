import { FastifyInstance } from 'fastify';
import {
  INITIAL_PORTFOLIO_VALUE,
  REQUIRED_ASSET_COUNT,
  TWELVE_DATA_API_BASE_URL,
} from '../constants.js';
import { ValidationError } from '../errors/index.js';
import { DynamoDBMatchItem } from '../models/match.js';
import { PlayerAsset, PlayerAssetSelections } from '../types/match.js';
import { MatchResult } from '../types/matchmaking.js';
import { collectUniqueTickers } from '../utils/match-utils.js';
import {
  canPlayerReadyUp,
  validateAssetSelection,
  validateMatchAccess,
  validatePlayers,
} from '../validators/match-validator.js';
import { validateTickerSymbol } from './asset.js';
import { broadcastToMatch } from './connection-manager.js';

interface PriceData {
  [ticker: string]: {
    price: string;
  };
}

const initializeMatchAssetPricing = async (
  fastify: FastifyInstance,
  matchId: string,
  playerAssets: PlayerAssetSelections,
  priceData: PriceData
): Promise<void> => {
  const updatePromises: Promise<void>[] = [];

  for (const [userId, playerData] of Object.entries(playerAssets)) {
    for (let i = 0; i < playerData.assets.length; i++) {
      const asset = playerData.assets[i];

      if (!priceData[asset.ticker]?.price) {
        throw new Error(`Missing price data for ticker: ${asset.ticker}`);
      }

      const initialPrice = parseFloat(priceData[asset.ticker].price);
      const shares =
        INITIAL_PORTFOLIO_VALUE / REQUIRED_ASSET_COUNT / initialPrice;

      // Update each asset with initialPrice and shares
      const updatePromise = fastify.repositories.match.setAssetInitialPricing(
        matchId,
        userId,
        i,
        initialPrice,
        shares
      );

      updatePromises.push(updatePromise);
    }
  }

  await Promise.all(updatePromises);
};

export const createMatch = async (
  fastify: FastifyInstance,
  players: string[]
): Promise<MatchResult> => {
  validatePlayers(players);

  try {
    const initialMatch =
      await fastify.repositories.match.persistNewMatch(players);

    fastify.log.info({
      matchId: initialMatch.matchId,
      players,
      msg: 'Match created successfully in both Redis and DynamoDB',
    });

    return initialMatch;
  } catch (error) {
    fastify.log.error({
      error,
      players,
      msg: 'Error in createMatch function',
    });
    throw error;
  }
};

export const handleAssetSelection = async (
  fastify: FastifyInstance,
  userId: string,
  payload: { matchId: string; ticker: string }
) => {
  const { matchId, ticker } = payload;

  try {
    const matchData = await fastify.repositories.match.getMatch(matchId);
    const { match } = validateMatchAccess(matchData, userId);

    const { exists, assetType } = await validateTickerSymbol(fastify, ticker);
    if (!exists || !assetType) {
      throw new Error(`Invalid ticker: ${ticker}`);
    }

    validateAssetSelection(match, userId, ticker);

    const newAsset: PlayerAsset = {
      ticker,
      selectedAt: new Date().toISOString(),
      assetType,
      initialPrice: 0, // Will be set when match starts
      shares: 0, // Will be set when match starts
    };

    await fastify.repositories.match.persistMatchAsset(
      matchId,
      userId,
      newAsset
    );

    const updatedMatch = await fastify.repositories.match.getMatch(matchId);
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
    const matchData = await fastify.repositories.match.getMatch(matchId);
    const { match } = validateMatchAccess(matchData, userId);

    const playerAssets = match.playerAssets[userId]?.assets || [];
    const assetIndex = playerAssets.findIndex(asset => asset.ticker === ticker);

    if (assetIndex === -1) {
      throw new Error("Asset not found in player's selection");
    }

    await fastify.repositories.match.removeMatchAsset(
      matchId,
      userId,
      assetIndex
    );

    const updatedMatch = await fastify.repositories.match.getMatch(matchId);
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
  payload: { matchId: string }
) => {
  const { matchId } = payload;
  try {
    const matchData = await fastify.repositories.match.getMatch(matchId);
    const { match } = validateMatchAccess(matchData, userId);

    canPlayerReadyUp(match, userId);

    const updatedMatch =
      await fastify.repositories.match.persistPlayerReadyStatus(
        matchId,
        userId
      );

    const bothPlayersReady = Object.values(updatedMatch.playerAssets).every(
      player => player.readyAt
    );

    if (bothPlayersReady) {
      const startedMatch = await handleMatchStart(fastify, matchId);

      await broadcastToMatch(fastify, startedMatch.matchId, {
        type: 'match_started',
        matchId: startedMatch.matchId,
        matchStartedAt: startedMatch.matchStartedAt,
        playerAssets: startedMatch.playerAssets,
        message: 'Match is starting! Good luck!',
      });
    } else {
      await broadcastToMatch(fastify, updatedMatch.matchId, {
        type: 'ready_status_update',
        matchId: updatedMatch.matchId,
        playerAssets: updatedMatch.playerAssets,
        status: 'asset_selection',
      });
    }

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

export const handleMatchStart = async (
  fastify: FastifyInstance,
  matchId: string
): Promise<DynamoDBMatchItem> => {
  try {
    const existingMatch = await fastify.repositories.match.getMatch(matchId);
    if (!existingMatch) {
      throw new Error('Match not found when attempting to start');
    }

    // If match is already in progress or completed, return as-is
    if (
      existingMatch.status === 'in_progress' ||
      existingMatch.status === 'completed'
    ) {
      fastify.log.info({
        matchId,
        status: existingMatch.status,
        msg: 'Match already started or completed, returning existing state',
      });
      return existingMatch;
    }

    if (existingMatch.status !== 'asset_selection') {
      throw new ValidationError(
        `Match cannot be started - invalid status: ${existingMatch.status}`
      );
    }

    const uniqueTickers = collectUniqueTickers(existingMatch.playerAssets);
    if (uniqueTickers.length === 0) {
      throw new Error('No assets found in match');
    }

    const commaSeparatedTickerSymbols = uniqueTickers.join(',');
    const priceApiResponse = await fetch(
      `${TWELVE_DATA_API_BASE_URL}/price?symbol=${commaSeparatedTickerSymbols}&apikey=${fastify.config.TWELVE_DATA_API_KEY}`
    );

    if (!priceApiResponse.ok) {
      fastify.log.error({
        matchId,
        status: priceApiResponse.status,
        statusText: priceApiResponse.statusText,
        msg: 'Failed to fetch prices from Twelve Data',
      });
      throw new Error(`Failed to fetch prices: ${priceApiResponse.statusText}`);
    }

    const fetchedPriceData = await priceApiResponse.json();
    const matchStartTimeIso = new Date().toISOString();

    // Update player assets with initial prices and shares
    await initializeMatchAssetPricing(
      fastify,
      matchId,
      existingMatch.playerAssets,
      fetchedPriceData
    );

    try {
      await fastify.repositories.match.transitionMatchToInProgress(
        matchId,
        matchStartTimeIso
      );
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        // If match was already started by another process, fetch and return current state
        const currentState = await fastify.repositories.match.getMatch(matchId);
        if (currentState?.status === 'in_progress') {
          fastify.log.info({
            matchId,
            msg: 'Race condition: Another process already started the match',
          });
          return currentState;
        }
        throw new ValidationError(
          'Failed to start match - match status changed unexpectedly'
        );
      }
      throw error;
    }

    const match = await fastify.repositories.match.getMatch(matchId);
    if (!match) {
      throw new Error('Failed to fetch match after starting');
    }

    fastify.log.info({
      matchId,
      msg: 'Match started successfully with initial prices',
    });

    return match;
  } catch (error: unknown) {
    fastify.log.error({
      error,
      matchId,
      msg: 'Error starting match',
    });

    if (
      error instanceof Error &&
      error.name !== 'ConditionalCheckFailedException'
    ) {
      try {
        await fastify.repositories.match.transitionMatchToAssetSelection(
          matchId
        );
      } catch (revertError) {
        fastify.log.error({
          error: revertError,
          matchId,
          msg: 'Failed to revert match status after error',
        });
      }
    }

    throw error;
  }
};

export const handleMatchEnd = async (
  fastify: FastifyInstance,
  matchId: string,
  winner: string,
  gameData: unknown
) => {
  // TODO: Implement match end logic
  console.log('Match end not implemented', {
    fastify,
    matchId,
    winner,
    gameData,
  });
};
