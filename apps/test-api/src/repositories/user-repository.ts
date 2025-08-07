import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBPlayerMatchItem } from '../models/match.js';
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
      experiencePoints: 0,
      stats: {
        totalMatches: 0,
        wins: 0,
        losses: 0,
      },
    };

    try {
      await dynamodb.send(
        new PutCommand({
          TableName: 'WageTable',
          Item: user,
          ConditionExpression: 'attribute_not_exists(PK)',
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

  const getUserById = async (
    userId: string
  ): Promise<DynamoDBUserItem | undefined> => {
    try {
      const scanParams = {
        TableName: 'WageTable',
        FilterExpression: 'userId = :userId AND EntityType = :entityType',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':entityType': 'User',
        },
      };

      const result = await dynamodb.send(new ScanCommand(scanParams));

      if (result.Items && result.Items.length > 0) {
        const user = result.Items[0] as DynamoDBUserItem;

        return user;
      }

      logger.warn({
        userId,
        msg: 'Repository: No user found with this userId',
      });
      return undefined;
    } catch (error) {
      logger.error({
        userId,

        msg: 'Error fetching user by ID',
      });
      throw error;
    }
  };

  const getUserByUsername = async (
    username: string
  ): Promise<DynamoDBUserItem | undefined> => {
    try {
      const result = await dynamodb.send(
        new ScanCommand({
          TableName: 'WageTable',
          FilterExpression: 'EntityType = :entityType AND username = :username',
          ExpressionAttributeValues: {
            ':entityType': 'User',
            ':username': username,
          },
          ConsistentRead: true,
        })
      );

      if (result.Items && result.Items.length > 0) {
        return result.Items[0] as DynamoDBUserItem;
      }

      return undefined;
    } catch (error) {
      logger.error({
        username,
        error,
        msg: 'Error fetching user by username',
      });
      throw error;
    }
  };

  const updateUsername = async (
    userId: string,
    username: string
  ): Promise<DynamoDBUserItem> => {
    try {
      const currentUser = await getUserById(userId);
      if (!currentUser) {
        throw new Error('User not found');
      }

      const existingUser = await getUserByUsername(username);
      if (existingUser && existingUser.userId !== userId) {
        throw new Error('Username already taken');
      }

      const updatedUser = {
        ...currentUser,
        username,
      };

      await dynamodb.send(
        new PutCommand({
          TableName: 'WageTable',
          Item: updatedUser,
        })
      );

      logger.info({
        userId,
        username,
        msg: 'Username updated successfully',
      });

      return updatedUser;
    } catch (error) {
      logger.error({
        userId,
        username,
        error,
        msg: 'Error updating username',
      });
      throw error;
    }
  };

  const getUserMatches = async (
    userId: string
  ): Promise<DynamoDBPlayerMatchItem[]> => {
    try {
      const user = await getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const result = await dynamodb.send(
        new QueryCommand({
          TableName: 'WageTable',
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': user.PK,
            ':skPrefix': 'MATCH#',
          },
        })
      );

      return (result.Items || []) as DynamoDBPlayerMatchItem[];
    } catch (error) {
      logger.error({
        userId,
        error,
        msg: 'Error fetching user matches',
      });
      throw error;
    }
  };

  return {
    fetchUserByPhone,
    getUserById,
    getUserByUsername,
    persistNewUser,
    updateUserLastLoginTimestamp,
    updateUsername,
    getUserMatches,
  };
};
