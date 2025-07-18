import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBUserItem } from '../models/user.js';

export const findUserByPhone = async (
  fastify: FastifyInstance,
  phoneNumber: string
): Promise<DynamoDBUserItem | undefined> => {
  const result = await fastify.dynamodb.send(
    new GetCommand({
      TableName: 'WageTable',
      Key: {
        PK: `USER#${phoneNumber}`,
        SK: 'PROFILE',
      },
    })
  );

  return result.Item as DynamoDBUserItem | undefined;
};

export const createUser = async (
  fastify: FastifyInstance,
  phoneNumber: string
): Promise<DynamoDBUserItem> => {
  const userId = uuidv4();
  const user: DynamoDBUserItem = {
    PK: `USER#${phoneNumber}`,
    SK: 'PROFILE',
    EntityType: 'User',
    userId,
    phoneNumber,
    createdAt: new Date().toISOString(),
    lastLoggedIn: new Date().toISOString(),
    stats: {
      totalMatches: 0,
      wins: 0,
      losses: 0,
      currentStreak: 0,
      longestStreak: 0,
      rank: 'Bronze',
      level: 1,
    },
  };

  await fastify.dynamodb.send(
    new PutCommand({
      TableName: 'WageTable',
      Item: user,
    })
  );

  fastify.log.info({
    userId,
    phoneNumber,
    msg: 'New user created',
  });

  return user;
};

export const updateUserLastLogin = async (
  fastify: FastifyInstance,
  user: DynamoDBUserItem
): Promise<void> => {
  await fastify.dynamodb.send(
    new PutCommand({
      TableName: 'WageTable',
      Item: {
        ...user,
        lastLoggedIn: new Date().toISOString(),
      },
    })
  );
};
