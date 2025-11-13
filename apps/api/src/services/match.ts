import { FastifyInstance } from 'fastify';
import {
  INITIAL_PORTFOLIO_VALUE,
  PREDEFINED_CHAT_MESSAGES,
  REQUIRED_ASSET_COUNT,
  TWELVE_DATA_API_BASE_URL,
} from '../constants.js';
import { ValidationError } from '../errors/index.js';
import { DynamoDBMatchItem } from '../models/match.js';
import {
  AssetPriceData,
  PlayerAsset,
  PlayerAssetSelections,
} from '../types/match.js';
import { MatchResult } from '../types/matchmaking.js';
import { collectUniqueTickers } from '../utils/match-utils.js';
import {
  canPlayerReadyUp,
  validateAssetSelection,
  validateMatchAccess,
  validatePlayers,
} from '../validators/match-validator.js';
import { broadcastToMatch } from './connection-manager.js';

const MATCH_DURATION_MS = 30 * 1000; // TODO: externalise to configuration

const resolveMatchTableName = (fastify: FastifyInstance) =>
  fastify.config.DYNAMODB_TABLE_NAME;

const startSettlementExecution = async (
  fastify: FastifyInstance,
  matchId: string,
  matchTentativeEndTimeIso: string
): Promise<string | undefined> => {
  if (
    !fastify.config.MATCH_SETTLEMENT_STATE_MACHINE_ARN ||
    !fastify.stepFunctions ||
    !fastify.stepFunctionsCommands?.StartExecutionCommand
  ) {
    fastify.log.debug(
      { matchId },
      'Settlement workflow not configured; skipping Step Functions execution'
    );
    return undefined;
  }

  try {
    const tableName = resolveMatchTableName(fastify);
    const startCommand =
      new fastify.stepFunctionsCommands.StartExecutionCommand({
        stateMachineArn: fastify.config.MATCH_SETTLEMENT_STATE_MACHINE_ARN,
        name: `match-${matchId}-${Date.now()}`,
        input: JSON.stringify({
          matchId,
          matchPk: `MATCH#${matchId}`,
          matchSk: 'DETAILS',
          matchTentativeEndTime: matchTentativeEndTimeIso,
          tableName,
        }),
      });

    const startResponse = await fastify.stepFunctions.send(startCommand);
    if (
      startResponse &&
      typeof startResponse === 'object' &&
      'executionArn' in startResponse
    ) {
      return (startResponse as { executionArn?: string }).executionArn;
    }
  } catch (error) {
    fastify.log.error(
      {
        error,
        matchId,
        stateMachineArn: fastify.config.MATCH_SETTLEMENT_STATE_MACHINE_ARN,
      },
      'Failed to start settlement workflow execution'
    );
  }

  return undefined;
};

const stopSettlementExecution = async (
  fastify: FastifyInstance,
  executionArn: string,
  cause: string
): Promise<void> => {
  if (
    !fastify.stepFunctions ||
    !fastify.stepFunctionsCommands?.StopExecutionCommand
  ) {
    return;
  }

  try {
    const stopCommand = new fastify.stepFunctionsCommands.StopExecutionCommand({
      executionArn,
      error: 'MatchTerminated',
      cause,
    });

    await fastify.stepFunctions.send(stopCommand);
  } catch (error) {
    fastify.log.warn(
      {
        error,
        executionArn,
        cause,
      },
      'Failed to stop Step Functions execution'
    );
  }
};

const initializeMatchAssetPricing = async (
  fastify: FastifyInstance,
  matchId: string,
  playerAssets: PlayerAssetSelections,
  assetPriceData: AssetPriceData
): Promise<void> => {
  const updatePromises: Promise<void>[] = [];

  for (const [userId, playerData] of Object.entries(playerAssets)) {
    for (let i = 0; i < playerData.assets.length; i++) {
      const asset = playerData.assets[i];

      if (!assetPriceData[asset.ticker]?.price) {
        throw new Error(`Missing price data for ticker: ${asset.ticker}`);
      }

      const initialPrice = parseFloat(assetPriceData[asset.ticker].price);
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

    const assetDetails =
      await fastify.repositories.asset.fetchAssetByTickerFromDB(ticker);
    if (!assetDetails) {
      throw new Error(`Invalid ticker: ${ticker}`);
    }

    validateAssetSelection(match, userId, ticker);

    const newAsset: PlayerAsset = {
      ticker,
      name: assetDetails.name,
      selectedAt: new Date().toISOString(),
      assetType: assetDetails.AssetType as PlayerAsset['assetType'],
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
  let settlementExecutionArn: string | undefined;
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
    const matchStartDate = new Date();
    const matchStartTimeIso = matchStartDate.toISOString();
    const matchTentativeEndTimeIso = new Date(
      matchStartDate.getTime() + MATCH_DURATION_MS
    ).toISOString();

    settlementExecutionArn = await startSettlementExecution(
      fastify,
      matchId,
      matchTentativeEndTimeIso
    );

    // Update player assets with initial prices and shares
    await initializeMatchAssetPricing(
      fastify,
      matchId,
      existingMatch.playerAssets,
      fetchedPriceData as AssetPriceData
    );

    try {
      await fastify.repositories.match.transitionMatchToInProgress(matchId, {
        matchStartTimeIso,
        matchTentativeEndTimeIso,
        settlementExecutionArn,
      });
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

    if (settlementExecutionArn) {
      await stopSettlementExecution(
        fastify,
        settlementExecutionArn,
        `Rolling back match start for ${matchId} due to error`
      );
    }

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

export const handlePlayerForfeit = async (
  fastify: FastifyInstance,
  userId: string,
  payload: { matchId: string }
): Promise<DynamoDBMatchItem | undefined> => {
  const matchId = payload.matchId;
  const match = await fastify.repositories.match.getMatch(matchId);
  if (!match) {
    throw new Error('Match not found when attempting to forfeit');
  }

  if (match.status !== 'in_progress') {
    fastify.log.info(
      {
        matchId,
        status: match.status,
        forfeitingPlayerId: userId,
      },
      'Ignoring forfeit request - match is not in progress'
    );
    return match;
  }

  // In production/cloud environments, enforce a grace period before allowing forfeit
  // Local development (NODE_ENV=development) remains unrestricted for easier testing
  try {
    if (fastify.config.NODE_ENV !== 'development') {
      const startedAt = match.matchStartedAt
        ? new Date(match.matchStartedAt).getTime()
        : undefined;
      const tentativeEnd = match.matchTentativeEndTime
        ? new Date(match.matchTentativeEndTime).getTime()
        : undefined;
      if (startedAt && tentativeEnd && tentativeEnd > startedAt) {
        const totalMs = tentativeEnd - startedAt;
        const gracePercentRaw = process.env.FORFEIT_GRACE_PERCENT ?? '0.1';
        const gracePercent =
          Math.max(0, Math.min(1, Number(gracePercentRaw))) || 0.1;
        const minElapsedMs = totalMs * gracePercent;
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs < minElapsedMs) {
          const minSeconds = Math.ceil(minElapsedMs / 1000);
          throw new ValidationError(
            `Forfeit not allowed yet. You can forfeit after ${minSeconds}s (grace ${Math.round(
              gracePercent * 100
            )}% of match time).`
          );
        }
      }
    }
  } catch (err) {
    // Re-throw validation errors to caller; log unexpected errors and continue to avoid blocking forfeit
    if (err instanceof ValidationError) {
      throw err;
    }
    fastify.log.warn(
      { err, matchId },
      'Failed to evaluate forfeit grace period; proceeding without restriction'
    );
  }

  if (match.matchSettlementExecutionArn) {
    await stopSettlementExecution(
      fastify,
      match.matchSettlementExecutionArn,
      `Player ${userId} forfeited match ${matchId}`
    );
  }

  const winnerId =
    match.players.find(playerId => playerId !== userId) ?? userId;

  const matchEndedAtIso = new Date().toISOString();

  try {
    const updatedMatch =
      await fastify.repositories.match.completeMatchWithOutcome(matchId, {
        completionReason: 'forfeited',
        matchEndedAtIso,
        winnerId,
        loserId: userId,
      });

    if (updatedMatch) {
      await broadcastToMatch(fastify, updatedMatch.matchId, {
        type: 'match_completed',
        matchId: updatedMatch.matchId,
        completionReason: 'forfeited',
        winnerId,
        forfeitingPlayerId: userId,
        matchEndedAt: updatedMatch.matchEndedAt,
      });
    }

    return updatedMatch ?? match;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'ConditionalCheckFailedException'
    ) {
      fastify.log.info(
        {
          matchId,
          forfeitingPlayerId: userId,
        },
        'Forfeit ignored: match already completed'
      );
      return fastify.repositories.match.getMatch(matchId);
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
  const match = await fastify.repositories.match.getMatch(matchId);
  if (!match) {
    throw new Error('Match not found when attempting to end');
  }

  if (match.matchSettlementExecutionArn) {
    await stopSettlementExecution(
      fastify,
      match.matchSettlementExecutionArn,
      `Match ${matchId} completed manually`
    );
  }

  const matchEndedAtIso = new Date().toISOString();
  const loserId = match.players.find(playerId => playerId !== winner);

  const finalScores =
    gameData &&
    typeof gameData === 'object' &&
    gameData !== null &&
    'finalScores' in gameData &&
    typeof (gameData as { finalScores?: Record<string, number> })
      .finalScores === 'object'
      ? (gameData as { finalScores?: Record<string, number> }).finalScores
      : undefined;

  try {
    const updatedMatch =
      await fastify.repositories.match.completeMatchWithOutcome(matchId, {
        completionReason: 'manual',
        matchEndedAtIso,
        winnerId: winner,
        loserId,
        finalScores,
      });

    if (updatedMatch) {
      await broadcastToMatch(fastify, updatedMatch.matchId, {
        type: 'match_completed',
        matchId: updatedMatch.matchId,
        completionReason: 'manual',
        winnerId: winner,
        matchEndedAt: updatedMatch.matchEndedAt,
        finalScores: updatedMatch.finalScores,
      });
      return;
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'ConditionalCheckFailedException'
    ) {
      fastify.log.info(
        {
          matchId,
          winner,
        },
        'Match already completed before handleMatchEnd executed'
      );
      return;
    }

    throw error;
  }
};

export const handleSetMatchDuration = async (
  fastify: FastifyInstance,
  userId: string,
  payload: { matchId: string; durationSeconds: number }
): Promise<DynamoDBMatchItem> => {
  if (payload.durationSeconds <= 0) {
    throw new ValidationError('durationSeconds must be positive');
  }

  const matchData = await fastify.repositories.match.getMatch(payload.matchId);
  const { match } = validateMatchAccess(matchData, userId);

  if (match.status !== 'in_progress') {
    throw new ValidationError('Match must be in progress to adjust duration');
  }

  const newTentativeEndTimeIso = new Date(
    Date.now() + payload.durationSeconds * 1000
  ).toISOString();

  if (match.matchSettlementExecutionArn) {
    await stopSettlementExecution(
      fastify,
      match.matchSettlementExecutionArn,
      `Match duration updated by ${userId}`
    );
  }

  const settlementExecutionArn = await startSettlementExecution(
    fastify,
    match.matchId,
    newTentativeEndTimeIso
  );

  await fastify.repositories.match.updateMatchTentativeEndTime(match.matchId, {
    matchTentativeEndTimeIso: newTentativeEndTimeIso,
    ...(settlementExecutionArn ? { settlementExecutionArn } : {}),
  });

  const updatedMatch = await fastify.repositories.match.getMatch(match.matchId);
  if (!updatedMatch) {
    throw new Error('Failed to fetch match after updating duration');
  }

  await broadcastToMatch(fastify, updatedMatch.matchId, {
    type: 'match_duration_updated',
    matchId: updatedMatch.matchId,
    matchTentativeEndTime: updatedMatch.matchTentativeEndTime,
  });

  return updatedMatch;
};

export const handleChatMessage = async (
  fastify: FastifyInstance,
  userId: string,
  payload: { matchId: string; messageId: string }
): Promise<void> => {
  const { matchId, messageId } = payload;

  if (!(messageId in PREDEFINED_CHAT_MESSAGES)) {
    throw new ValidationError(`Invalid message ID: ${messageId}`);
  }

  try {
    const matchData = await fastify.repositories.match.getMatch(matchId);
    const { match } = validateMatchAccess(matchData, userId);

    if (match.status !== 'in_progress') {
      throw new ValidationError(
        'Can only send chat messages during active matches'
      );
    }

    const user = await fastify.repositories.user.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const username = user.username || 'Player';

    await fastify.repositories.match.addChatMessage(
      matchId,
      userId,
      username,
      messageId
    );

    await broadcastToMatch(fastify, matchId, {
      type: 'chat_message',
      matchId,
      message: {
        senderId: userId,
        username,
        messageId,
        createdAt: new Date().toISOString(),
      },
    });

    fastify.log.info({
      matchId,
      userId,
      messageId,
      msg: 'Chat message sent successfully',
    });
  } catch (error) {
    fastify.log.error({
      error,
      matchId,
      userId,
      messageId: payload.messageId,
      msg: 'Error handling chat message',
    });
    throw error;
  }
};
