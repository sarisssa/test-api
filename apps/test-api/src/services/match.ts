import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { REDIS_KEYS } from '../constants.js';
import { DynamoDBMatchItem } from '../models/match.js';
import { PlayerAsset } from '../types/match';
import { MatchResult } from '../types/matchmaking.js';

export const createMatch = async (
  fastify: FastifyInstance,
  players: string[]
): Promise<MatchResult> => {
  const matchId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

    const now = new Date().toISOString();

    // Initialize playerAssets structure for both players
    const playerAssets = players.reduce((acc, playerId) => {
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
          createdAt: now,
          assetSelectionStartedAt: now,
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
    fastify.log.info({
      matchId,
      msg: 'Attempting to fetch match from DynamoDB',
      key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' }, // Log the exact key we're using
    });

    const result = await fastify.dynamodb.send(
      new GetCommand({
        TableName: 'WageTable',
        Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' },
      })
    );

    if (!result.Item) {
      fastify.log.warn({
        matchId,
        msg: 'Match not found in DynamoDB',
        tableUsed: 'WageTable',
      });
      return undefined;
    }

    fastify.log.info({
      matchId,
      matchData: result.Item, // Log the full match data
      msg: 'Match found in DynamoDB',
    });

    return result.Item as DynamoDBMatchItem;
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
          ':maxAssets': 3,
          ':newAsset': [newAsset],
        },
      })
    );

    fastify.log.info({
      matchId,
      userId,
      asset: asset.ticker,
      msg: 'Asset added to match successfully',
    });
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error(
        'Cannot add asset: match status invalid or asset limit reached'
      );
    }
    throw error;
  }
};

export const endMatch = async (
  fastify: FastifyInstance,
  matchId: string,
  winner: string,
  gameData: any
) => {};
