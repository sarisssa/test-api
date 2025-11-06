import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBChallengeItem } from '../models/challenge.js';
import { calculateChallengeExpiration } from '../utils/challenge-utils.js';

export const createChallengeRepository = (fastify: FastifyInstance) => {
  const dynamodb = DynamoDBDocumentClient.from(
    fastify.dynamodb as DynamoDBClient
  );
  const { log: logger } = fastify;

  const createChallenge = async (
    challengerId: string,
    challengedId: string,
    duration: 30 | 60 | 120 | 240,
    amount: 5 | 10 | 15 | 25,
    category: 'stock' | 'crypto' | 'commodities'
  ): Promise<DynamoDBChallengeItem> => {
    const challengeId = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = calculateChallengeExpiration(category, duration);

    const challengerChallenge: DynamoDBChallengeItem = {
      pk: `USER#${challengerId}`,
      sk: `CHALLENGE#${challengeId}`,
      EntityType: 'Challenge',
      challengeId,
      challengerId,
      challengedId,
      status: 'PENDING',
      duration,
      amount,
      category,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiresAt || undefined,
      gsi1_pk: `CHALLENGER#${challengerId}`,
      gsi1_sk: `CHALLENGE#${challengeId}`,
    };

    const challengedChallenge: DynamoDBChallengeItem = {
      pk: `USER#${challengedId}`,
      sk: `CHALLENGE#${challengeId}`,
      EntityType: 'Challenge',
      challengeId,
      challengerId,
      challengedId,
      status: 'PENDING',
      duration,
      amount,
      category,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiresAt || undefined,
      gsi1_pk: `CHALLENGED#${challengedId}`,
      gsi1_sk: `CHALLENGE#${challengeId}`,
    };

    try {
      await Promise.all([
        dynamodb.send(
          new PutCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Item: challengerChallenge,
          })
        ),
        dynamodb.send(
          new PutCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Item: challengedChallenge,
          })
        ),
      ]);

      return challengerChallenge;
    } catch (error) {
      logger.error({
        error,
        challengerId,
        challengedId,
        msg: 'Error creating challenge',
      });
      throw error;
    }
  };

  const getChallenge = async (
    challengeId: string
  ): Promise<DynamoDBChallengeItem | null> => {
    try {
      const result = await dynamodb.send(
        new ScanCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          FilterExpression: 'contains(sk, :challengeId)',
          ExpressionAttributeValues: {
            ':challengeId': challengeId,
          },
        })
      );

      return (result.Items?.[0] as DynamoDBChallengeItem) || null;
    } catch (error) {
      logger.error({
        error,
        challengeId,
        msg: 'Error fetching challenge',
      });
      throw error;
    }
  };

  const getUserChallenges = async (
    userId: string
  ): Promise<DynamoDBChallengeItem[]> => {
    try {
      const [outgoingResult, incomingResult] = await Promise.all([
        dynamodb.send(
          new QueryCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            IndexName: 'gsi1-index',
            KeyConditionExpression:
              'gsi1_pk = :userKey AND begins_with(gsi1_sk, :prefix)',
            ExpressionAttributeValues: {
              ':userKey': `CHALLENGER#${userId}`,
              ':prefix': 'CHALLENGE#',
            },
          })
        ),
        dynamodb.send(
          new QueryCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            IndexName: 'gsi1-index',
            KeyConditionExpression:
              'gsi1_pk = :userKey AND begins_with(gsi1_sk, :prefix)',
            ExpressionAttributeValues: {
              ':userKey': `CHALLENGED#${userId}`,
              ':prefix': 'CHALLENGE#',
            },
          })
        ),
      ]);

      const outgoing = (outgoingResult.Items || []) as DynamoDBChallengeItem[];
      const incoming = (incomingResult.Items || []) as DynamoDBChallengeItem[];

      return [...outgoing, ...incoming];
    } catch (error) {
      logger.error({
        error,
        userId,
        msg: 'Error fetching user challenges',
      });
      throw error;
    }
  };

  const updateChallengeStatus = async (
    challengeId: string,
    status: 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'
  ): Promise<void> => {
    const challenge = await getChallenge(challengeId);
    if (!challenge) {
      throw new Error('Challenge not found');
    }

    const now = new Date().toISOString();

    try {
      await Promise.all([
        dynamodb.send(
          new PutCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Item: {
              ...challenge,
              pk: `USER#${challenge.challengerId}`,
              sk: `CHALLENGE#${challengeId}`,
              gsi1_pk: `CHALLENGER#${challenge.challengerId}`,
              gsi1_sk: `CHALLENGE#${challengeId}`,
              status,
              updatedAt: now,
            },
          })
        ),
        dynamodb.send(
          new PutCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Item: {
              ...challenge,
              pk: `USER#${challenge.challengedId}`,
              sk: `CHALLENGE#${challengeId}`,
              gsi1_pk: `CHALLENGED#${challenge.challengedId}`,
              gsi1_sk: `CHALLENGE#${challengeId}`,
              status,
              updatedAt: now,
            },
          })
        ),
      ]);
    } catch (error) {
      logger.error({
        error,
        challengeId,
        status,
        msg: 'Error updating challenge status',
      });
      throw error;
    }
  };

  // TODO: Might not need this
  const deleteChallenge = async (challengeId: string): Promise<void> => {
    const challenge = await getChallenge(challengeId);
    if (!challenge) return;

    try {
      await Promise.all([
        dynamodb.send(
          new DeleteCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Key: {
              pk: `USER#${challenge.challengerId}`,
              sk: `CHALLENGE#${challengeId}`,
            },
          })
        ),
        dynamodb.send(
          new DeleteCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Key: {
              pk: `USER#${challenge.challengedId}`,
              sk: `CHALLENGE#${challengeId}`,
            },
          })
        ),
      ]);

      logger.info({
        challengeId,
        msg: 'Challenge deleted successfully',
      });
    } catch (error) {
      logger.error({
        error,
        challengeId,
        msg: 'Error deleting challenge',
      });
      throw error;
    }
  };

  const markChallengeAsRead = async (
    userId: string,
    challengeId: string
  ): Promise<void> => {
    const challenge = await getChallenge(challengeId);
    if (!challenge) {
      throw new Error('Challenge not found');
    }

    // Verify this user is the challenged user (the one receiving the notification)
    if (challenge.challengedId !== userId) {
      throw new Error('User is not authorized to mark this challenge as read');
    }

    const now = new Date().toISOString();

    try {
      // Update both items (challenger and challenged copies) to maintain consistency
      await Promise.all([
        dynamodb.send(
          new PutCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Item: {
              ...challenge,
              pk: `USER#${challenge.challengerId}`,
              sk: `CHALLENGE#${challengeId}`,
              gsi1_pk: `CHALLENGER#${challenge.challengerId}`,
              gsi1_sk: `CHALLENGE#${challengeId}`,
              readAt: now,
              updatedAt: now,
            },
          })
        ),
        dynamodb.send(
          new PutCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Item: {
              ...challenge,
              pk: `USER#${challenge.challengedId}`,
              sk: `CHALLENGE#${challengeId}`,
              gsi1_pk: `CHALLENGED#${challenge.challengedId}`,
              gsi1_sk: `CHALLENGE#${challengeId}`,
              readAt: now,
              updatedAt: now,
            },
          })
        ),
      ]);

      logger.info({
        challengeId,
        userId,
        msg: 'Challenge marked as read',
      });
    } catch (error) {
      logger.error({
        error,
        challengeId,
        userId,
        msg: 'Error marking challenge as read',
      });
      throw error;
    }
  };

  return {
    createChallenge,
    getChallenge,
    getUserChallenges,
    updateChallengeStatus,
    deleteChallenge,
    markChallengeAsRead,
  };
};
