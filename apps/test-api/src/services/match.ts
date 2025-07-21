import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { MAX_ASSETS_PER_PLAYER, REDIS_KEYS } from '../constants.js';
import { ValidationError } from '../errors/index.js';
import { DynamoDBMatchItem } from '../models/match.js';
import { PlayerAsset } from '../types/match';
import { MatchResult } from '../types/matchmaking.js';
import {
  canPlayerReadyUp,
  validateAssetSelection,
  validatePlayers,
} from '../validators/match-validator.js';

const ASSET_SELECTION_DURATION = 2 * 60 * 1000;

export const createMatch = async (
  fastify: FastifyInstance,
  players: string[]
): Promise<MatchResult> => {
  validatePlayers(players);

  const matchId = uuidv4();
  const match: MatchResult = {
    matchId,
    players,
    createdAt: Date.now(),
  };

  try {
    fastify.log.info({
      matchId,
      players,
      msg: 'Attempting to write match to DynamoDB and Redis',
    });

    const redisPromise = fastify.redis.hset(REDIS_KEYS.MATCH(matchId), {
      players: JSON.stringify(players),
      createdAt: match.createdAt,
      status: 'asset_selection',
    });

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const assetSelectionEndedAtIso = new Date(
      nowMs + ASSET_SELECTION_DURATION
    ).toISOString();
    // Initialize playerAssets structure for both players
    const playerAssets = players.reduce<
      Record<string, { assets: PlayerAsset[] }>
    >((acc, playerId) => {
      acc[playerId] = {
        assets: [],
      };
      return acc;
    }, {});

    const dynamoPromise = fastify.dynamodb.send(
      new PutCommand({
        TableName: 'WageTable',
        Item: {
          PK: `MATCH#${matchId}`,
          SK: 'DETAILS',
          EntityType: 'Match',
          matchId,
          players,
          status: 'asset_selection',
          createdAt: nowIso,
          assetSelectionStartedAt: nowIso,
          assetSelectionEndedAt: assetSelectionEndedAtIso,
          playerAssets,
        },
      })
    );

    await Promise.all([redisPromise, dynamoPromise]);

    fastify.log.info({ matchId, msg: 'Match written to Redis successfully' });
    fastify.log.info({
      matchId,
      msg: 'Match written to DynamoDB successfully',
    });
    fastify.log.info({ matchId, msg: 'Match creation completed successfully' });

    return match;
  } catch (error) {
    fastify.log.error({
      error,
      matchId,
      players,
      msg: 'Error in createMatch function',
    });
    throw error;
  }
};

export const getMatch = async (
  fastify: FastifyInstance,
  matchId: string
): Promise<DynamoDBMatchItem | undefined> => {
  try {
    const cachedMatch = await fastify.redis.hgetall(REDIS_KEYS.MATCH(matchId));

    if (
      cachedMatch &&
      cachedMatch.playerAssets &&
      cachedMatch.players &&
      cachedMatch.status
    ) {
      fastify.log.info({ matchId, msg: 'Match found in Redis cache' });
      return {
        PK: `MATCH#${matchId}`,
        SK: 'DETAILS',
        EntityType: 'Match',
        matchId,
        players: JSON.parse(cachedMatch.players),
        status: cachedMatch.status,
        createdAt: cachedMatch.createdAt,
        playerAssets: JSON.parse(cachedMatch.playerAssets),
        assetSelectionStartedAt: cachedMatch.assetSelectionStartedAt,
        assetSelectionEndedAt: cachedMatch.assetSelectionEndedAt || '',
        matchStartedAt: cachedMatch.matchStartedAt || '',
        portfolios: cachedMatch.portfolios
          ? JSON.parse(cachedMatch.portfolios)
          : {},
      } as DynamoDBMatchItem;
    }

    //Cache miss, fetch from DynamoDB
    const matchResult = await fastify.dynamodb.send(
      new GetCommand({
        TableName: 'WageTable',
        Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' },
      })
    );

    if (!matchResult.Item) {
      fastify.log.warn({
        matchId,
        msg: 'Match not found in DynamoDB',
        tableUsed: 'WageTable',
      });
      return undefined;
    }

    const match = matchResult.Item as DynamoDBMatchItem;

    // Cache the complete result from DynamoDB
    await fastify.redis.hset(REDIS_KEYS.MATCH(matchId), {
      players: JSON.stringify(match.players),
      status: match.status,
      createdAt: match.createdAt,
      playerAssets: JSON.stringify(match.playerAssets),
      assetSelectionStartedAt: match.assetSelectionStartedAt,
      assetSelectionEndedAt: match.assetSelectionEndedAt || '',
      matchStartedAt: match.matchStartedAt || '',
      portfolios: JSON.stringify(match.portfolios || {}),
    });

    fastify.log.info({
      matchId,
      msg: 'Match cached in Redis after DynamoDB fetch',
    });

    return match;
  } catch (error) {
    fastify.log.error({
      error,
      matchId,
      msg: 'Error fetching match from DynamoDB',
    });
    throw error;
  }
};

export const addAssetToMatch = async (
  fastify: FastifyInstance,
  matchId: string,
  userId: string,
  asset: { ticker: string }
): Promise<void> => {
  try {
    //TODO: Add validation for ticker + check that ticker actually exists in the DB

    const match = await getMatch(fastify, matchId);
    if (!match) {
      throw new ValidationError('Match not found');
    }

    validateAssetSelection(match, userId, asset.ticker);

    const newAsset: PlayerAsset = {
      ...asset,
      selectedAt: new Date().toISOString(),
    };

    await fastify.dynamodb.send(
      new UpdateCommand({
        TableName: 'WageTable',
        Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' },
        ConditionExpression:
          'attribute_exists(PK) AND attribute_exists(SK) AND #status = :assetStatus AND size(playerAssets.#userId.assets) < :maxAssets',
        UpdateExpression:
          'SET playerAssets.#userId.assets = list_append(playerAssets.#userId.assets, :newAsset)',
        ExpressionAttributeNames: {
          '#userId': userId,
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':assetStatus': 'asset_selection',
          ':maxAssets': MAX_ASSETS_PER_PLAYER,
          ':newAsset': [newAsset],
        },
      })
    );

    await fastify.redis.del(REDIS_KEYS.MATCH(matchId));

    fastify.log.info({
      matchId,
      userId,
      asset: asset.ticker,
      msg: 'Asset added to match successfully',
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === 'ConditionalCheckFailedException'
    ) {
      throw new Error('Cannot add asset: match status invalid');
    }
    throw error;
  }
};

export const removeAssetFromMatch = async (
  fastify: FastifyInstance,
  matchId: string,
  userId: string,
  ticker: string
): Promise<void> => {
  try {
    // First get the current match to find the asset index
    const match = await getMatch(fastify, matchId);
    if (!match) throw new Error('Match not found');

    const playerAssets = match.playerAssets[userId]?.assets || [];
    const assetIndex = playerAssets.findIndex(asset => asset.ticker === ticker);

    if (assetIndex === -1) {
      throw new Error("Asset not found in player's selection");
    }

    await fastify.dynamodb.send(
      new UpdateCommand({
        TableName: 'WageTable',
        Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' },
        ConditionExpression:
          'attribute_exists(PK) AND attribute_exists(SK) AND #status = :assetStatus',
        UpdateExpression: `REMOVE playerAssets.#userId.assets[${assetIndex}]`,
        ExpressionAttributeNames: {
          '#userId': userId,
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':assetStatus': 'asset_selection',
        },
      })
    );

    await fastify.redis.del(REDIS_KEYS.MATCH(matchId));

    fastify.log.info({
      matchId,
      userId,
      ticker,
      msg: 'Asset removed from match successfully',
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'ConditionalCheckFailedException'
    ) {
      throw new Error('Cannot remove asset: match status invalid');
    }
    throw error;
  }
};

export const updatePlayerReadyStatus = async (
  fastify: FastifyInstance,
  matchId: string,
  userId: string
): Promise<DynamoDBMatchItem> => {
  try {
    const currentMatch = await getMatch(fastify, matchId);

    if (!currentMatch) {
      throw new Error('Match not found when attempting to ready up.');
    }

    canPlayerReadyUp(currentMatch, userId);

    await fastify.dynamodb.send(
      new UpdateCommand({
        TableName: 'WageTable',
        Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' },
        UpdateExpression: 'SET playerAssets.#userId.readyAt = :now',
        ExpressionAttributeNames: { '#userId': userId },
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
      })
    );

    await fastify.redis.del(REDIS_KEYS.MATCH(matchId));
    const updatedMatch = await getMatch(fastify, matchId);
    if (!updatedMatch) {
      throw new Error(
        'Failed to fetch updated match after ready status update'
      );
    }

    fastify.log.info({
      matchId,
      userId,
      msg: 'Player ready status updated successfully',
    });

    return updatedMatch;
  } catch (error) {
    fastify.log.error({
      error,
      matchId,
      userId,
      msg: 'Error updating player ready status',
    });
    throw error;
  }
};

export const startMatch = async (
  fastify: FastifyInstance,
  matchId: string
): Promise<DynamoDBMatchItem> => {
  try {
    const now = new Date().toISOString();

    await fastify.dynamodb.send(
      new UpdateCommand({
        TableName: 'WageTable',
        Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' },
        UpdateExpression: 'SET #status = :status, matchStartedAt = :now',
        ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'in_progress',
          ':now': now,
        },
      })
    );

    await fastify.redis.del(REDIS_KEYS.MATCH(matchId));
    const match = await getMatch(fastify, matchId);
    if (!match) {
      throw new Error('Failed to fetch match after starting');
    }

    fastify.log.info({
      matchId,
      msg: 'Match started successfully',
    });

    return match;
  } catch (error) {
    fastify.log.error({
      error,
      matchId,
      msg: 'Error starting match',
    });
    throw error;
  }
};

export const endMatch = async (
  fastify: FastifyInstance,
  matchId: string,
  winner: string,
  gameData: any
) => {};
