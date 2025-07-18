import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
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

  try {
    await fastify.dynamodb.send(
      new PutCommand({
        TableName: 'WageTable',
        Item: user,
        ConditionExpression: 'attribute_not_exists(PK)', // ONLY create a new user if PK does not exist
      })
    );

    fastify.log.info({
      userId,
      phoneNumber,
      msg: 'New user created',
    });

    return user;
  } catch (error) {
    // If another concurrent request already created the user, ConditionalCheckFailedException is thrown
    if (error instanceof ConditionalCheckFailedException) {
      fastify.log.warn({
        phoneNumber,
        msg: 'User already exists, another concurrent request likely created it.',
      });
      // In this case, fetch the existing user that was just created by the other task
      const existingUser = await findUserByPhone(fastify, phoneNumber);
      if (existingUser) {
        return existingUser; // Return the user that now exists
      } else {
        // Fallback for unexpected states or eventual consistency delays.
        fastify.log.error({
          phoneNumber,
          error,
          msg: 'ConditionalCheckFailedException but user not found immediately after. Potential consistency issue.',
        });
        throw new Error(
          'Failed to create user and could not retrieve existing user.'
        );
      }
    } else {
      // Re-throw other unexpected errors
      fastify.log.error({
        phoneNumber,
        error,
        msg: 'Error creating user in DynamoDB',
      });
      throw error;
    }
  }
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
