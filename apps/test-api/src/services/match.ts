import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { MatchResult } from '../types/matchmaking.js';

export const createMatch = async (
  fastify: FastifyInstance,
  players: string[]
): Promise<MatchResult> => {
  const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

    const redisPromise = fastify.redis.hset(`match:${matchId}`, {
      players: JSON.stringify(players),
      createdAt: match.createdAt,
      status: 'created',
    });

    const dynamoPromise = fastify.dynamodb.send(
      new PutCommand({
        TableName: 'WageTable',
        Item: {
          PK: `MATCH#${matchId}`,
          SK: 'DETAILS',
          EntityType: 'Match',
          matchId,
          players,
          status: 'created',
          createdAt: new Date().toISOString(),
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

export const getMatch = async (fastify: FastifyInstance, matchId: string) => {
  const result = await fastify.dynamodb.send(
    new GetCommand({
      TableName: 'WageTable',
      Key: { PK: `MATCH#${matchId}`, SK: 'DETAILS' },
    })
  );
  return result.Item;
};

export const endMatch = async (
  fastify: FastifyInstance,
  matchId: string,
  winner: string,
  gameData: any
) => {};
