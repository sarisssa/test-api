import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { MAX_ASSETS_PER_PLAYER, REDIS_KEYS } from '../constants.js';
import { DynamoDBMatchItem } from '../models/match.js';
import { PlayerAsset } from '../types/match.js';
import { MatchResult } from '../types/matchmaking.js';

const ASSET_SELECTION_DURATION = 2 * 60 * 1000;

export const createMatchRepository = (fastify: FastifyInstance) => {
  const dynamodb = DynamoDBDocumentClient.from(
    fastify.dynamodb as DynamoDBClient
  );
  const { redis, log: logger } = fastify;

  const persistNewMatch = async (players: string[]): Promise<MatchResult> => {
    const matchId = uuidv4();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const assetSelectionEndedAtIso = new Date(
      nowMs + ASSET_SELECTION_DURATION
    ).toISOString();

    const match: MatchResult = {
      matchId,
      players,
      createdAt: nowMs,
    };

    try {
      const cacheUpdatePromise = redis.hset(REDIS_KEYS.MATCH(matchId), {
        players: JSON.stringify(players),
        createdAt: match.createdAt,
        status: 'asset_selection',
      });

      const playerAssets = players.reduce<
        Record<string, { assets: PlayerAsset[] }>
      >((acc, playerId) => {
        acc[playerId] = { assets: [] };
        return acc;
      }, {});

      const dbWritePromise = dynamodb.send(
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

      await Promise.all([cacheUpdatePromise, dbWritePromise]);
      logger.info({
        matchId,
        msg: 'Match created successfully in both Redis and DynamoDB',
      });

      return match;
    } catch (error) {
      logger.error({
        error,
        matchId,
        players,
        msg: 'Error creating match',
      });
      throw error;
    }
  };

  const getMatch = async (
    matchId: string
  ): Promise<DynamoDBMatchItem | undefined> => {
    try {
      const cachedMatch = await redis.hgetall(REDIS_KEYS.MATCH(matchId));

      if (
        cachedMatch &&
        cachedMatch.playerAssets &&
        cachedMatch.players &&
        cachedMatch.status
      ) {
        logger.info({ matchId, msg: 'Match found in Redis cache' });
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

      const matchResult = await dynamodb.send(
        new GetCommand({
          TableName: 'WageTable',
          Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' },
        })
      );

      if (!matchResult.Item) {
        logger.warn({
          matchId,
          msg: 'Match not found in DynamoDB',
          tableUsed: 'WageTable',
        });
        return undefined;
      }

      const match = matchResult.Item as DynamoDBMatchItem;

      // Cache the complete result from DynamoDB
      await redis.hset(REDIS_KEYS.MATCH(matchId), {
        players: JSON.stringify(match.players),
        status: match.status,
        createdAt: match.createdAt,
        playerAssets: JSON.stringify(match.playerAssets),
        assetSelectionStartedAt: match.assetSelectionStartedAt,
        assetSelectionEndedAt: match.assetSelectionEndedAt || '',
        matchStartedAt: match.matchStartedAt || '',
        portfolios: JSON.stringify(match.portfolios || {}),
      });

      logger.info({
        matchId,
        msg: 'Match cached in Redis after DynamoDB fetch',
      });

      return match;
    } catch (error) {
      logger.error({
        error,
        matchId,
        msg: 'Error fetching match from DynamoDB',
      });
      throw error;
    }
  };

  const persistMatchAsset = async (
    matchId: string,
    userId: string,
    asset: PlayerAsset
  ): Promise<void> => {
    try {
      await dynamodb.send(
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
            ':newAsset': [asset],
          },
        })
      );

      await redis.del(REDIS_KEYS.MATCH(matchId));
      logger.info({
        matchId,
        userId,
        asset: asset.ticker,
        msg: 'Asset persisted to match',
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        throw new Error('Cannot persist asset: match status invalid');
      }
      throw error;
    }
  };

  const removeMatchAsset = async (
    matchId: string,
    userId: string,
    assetIndex: number
  ): Promise<void> => {
    try {
      await dynamodb.send(
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

      await redis.del(REDIS_KEYS.MATCH(matchId));
      logger.info({
        matchId,
        userId,
        assetIndex,
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

  const persistPlayerReadyStatus = async (
    matchId: string,
    userId: string
  ): Promise<DynamoDBMatchItem> => {
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: 'WageTable',
          Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' },
          UpdateExpression: 'SET playerAssets.#userId.readyAt = :now',
          ExpressionAttributeNames: { '#userId': userId },
          ExpressionAttributeValues: { ':now': new Date().toISOString() },
        })
      );

      await redis.del(REDIS_KEYS.MATCH(matchId));

      const updatedMatch = await getMatch(matchId);
      if (!updatedMatch) {
        throw new Error(
          'Failed to fetch updated match after ready status update'
        );
      }

      logger.info({
        matchId,
        userId,
        msg: 'Player ready status updated successfully',
      });

      return updatedMatch;
    } catch (error) {
      logger.error({
        error,
        matchId,
        userId,
        msg: 'Error updating player ready status',
      });
      throw error;
    }
  };

  const transitionMatchToInProgress = async (
    matchId: string,
    portfolios: Record<string, unknown>,
    matchStartTimeIso: string
  ): Promise<void> => {
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: 'WageTable',
          Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' },
          UpdateExpression:
            'SET #status = :newStatus, matchStartedAt = :now, portfolios = :portfolios',
          ConditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND #status = :expectedStatus',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':newStatus': 'in_progress',
            ':expectedStatus': 'asset_selection',
            ':now': matchStartTimeIso,
            ':portfolios': portfolios,
          },
        })
      );

      await redis.del(REDIS_KEYS.MATCH(matchId));
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        throw error;
      }
      logger.error({
        error,
        matchId,
        msg: 'Error starting match in DynamoDB',
      });
      throw error;
    }
  };

  const transitionMatchToAssetSelection = async (
    matchId: string
  ): Promise<void> => {
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: 'WageTable',
          Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' },
          UpdateExpression: 'SET #status = :status',
          ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'asset_selection',
          },
        })
      );
      await redis.del(REDIS_KEYS.MATCH(matchId));

      logger.info({
        matchId,
        msg: 'Match reverted to asset selection status',
      });
    } catch (error) {
      logger.error({
        error,
        matchId,
        msg: 'Error reverting match to asset selection status',
      });
      throw error;
    }
  };

  return {
    getMatch,
    persistNewMatch,
    persistMatchAsset,
    removeMatchAsset,
    persistPlayerReadyStatus,
    transitionMatchToInProgress,
    transitionMatchToAssetSelection,
  };
};
