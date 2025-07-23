import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBUserItem } from '../models/user.js';
import { formatPhoneNumber, hashPhoneNumber } from '../utils/phone-utils.js';

export const createUserRepository = (fastify: FastifyInstance) => {
  const dynamodb = DynamoDBDocumentClient.from(
    fastify.dynamodb as DynamoDBClient
  );
  const { log: logger } = fastify;

  const fetchUserByPhone = async (
    phoneNumber: string
  ): Promise<DynamoDBUserItem | undefined> => {
    const hashedPhoneNumber = hashPhoneNumber(phoneNumber);

    const result = await dynamodb.send(
      new GetCommand({
        TableName: 'WageTable',
        Key: {
          PK: `USER#${hashedPhoneNumber}`,
          SK: 'PROFILE',
        },
      })
    );

    return result.Item as DynamoDBUserItem | undefined;
  };

  const persistNewUser = async (
    phoneNumber: string
  ): Promise<DynamoDBUserItem> => {
    const hashedPhoneNumber = hashPhoneNumber(phoneNumber);
    const normalizedPhone = formatPhoneNumber(phoneNumber);
    const userId = uuidv4();

    const user: DynamoDBUserItem = {
      PK: `USER#${hashedPhoneNumber}`,
      SK: 'PROFILE',
      EntityType: 'User',
      userId,
      hashedPhoneNumber,
      phoneNumber: normalizedPhone,
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
      await dynamodb.send(
        new PutCommand({
          TableName: 'WageTable',
          Item: user,
          ConditionExpression: 'attribute_not_exists(PK)', // ONLY create a new user if PK does not exist
        })
      );

      logger.info({
        userId,
        phoneNumber,
        msg: 'New user created',
      });

      return user;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        logger.warn({
          phoneNumber,
          msg: 'User already exists, another concurrent request likely created it.',
        });
        // In this case, fetch the existing user that was just created by the other task
        const existingUser = await fetchUserByPhone(phoneNumber);
        if (existingUser) {
          return existingUser;
        } else {
          logger.error({
            phoneNumber,
            error,
            msg: 'ConditionalCheckFailedException but user not found immediately after. Potential consistency issue.',
          });
          throw new Error(
            'Failed to create user and could not retrieve existing user.'
          );
        }
      }

      logger.error({
        phoneNumber,
        error,
        msg: 'Error creating user in DynamoDB',
      });
      throw error;
    }
  };

  const updateUserLastLoginTimestamp = async (
    user: DynamoDBUserItem
  ): Promise<void> => {
    try {
      await dynamodb.send(
        new PutCommand({
          TableName: 'WageTable',
          Item: {
            ...user,
            lastLoggedIn: new Date().toISOString(),
          },
        })
      );

      logger.info({
        userId: user.userId,
        msg: 'User last login updated',
      });
    } catch (error) {
      logger.error({
        userId: user.userId,
        error,
        msg: 'Error updating user last login',
      });
      throw error;
    }
  };

  return {
    fetchUserByPhone,
    persistNewUser,
    updateUserLastLoginTimestamp,
  };
};
