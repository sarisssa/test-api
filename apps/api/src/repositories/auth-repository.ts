import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { createHash, randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import { DynamoDBRefreshTokenItem } from '../models/refresh-token.js';

export const createAuthRepository = (fastify: FastifyInstance) => {
  const dynamodb = DynamoDBDocumentClient.from(
    fastify.dynamodb as DynamoDBClient
  );
  const { log: logger } = fastify;

  const storeRefreshToken = async (
    userId: string,
    token: string,
    expiresInDays: number = 30,
    deviceInfo?: {
      deviceId?: string;
      deviceName?: string;
      userAgent?: string;
      ipAddress?: string;
    }
  ): Promise<string> => {
    const tokenId = randomUUID();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + expiresInDays * 24 * 60 * 60 * 1000
    );

    const refreshTokenItem: DynamoDBRefreshTokenItem = {
      pk: `USER#${userId}`,
      sk: `REFRESH_TOKEN#${tokenId}`,
      EntityType: 'RefreshToken',
      tokenId,
      userId,
      tokenHash,
      deviceInfo,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isRevoked: false,
      gsi1_pk: `TOKEN#${tokenHash}`,
      gsi1_sk: `USER#${userId}`,
      ttl: Math.floor(expiresAt.getTime() / 1000),
    };

    try {
      await dynamodb.send(
        new PutCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          Item: refreshTokenItem,
        })
      );

      logger.info({
        userId,
        tokenId,
        expiresAt: expiresAt.toISOString(),
        msg: 'Refresh token stored successfully',
      });

      return tokenId;
    } catch (error) {
      logger.error({
        error,
        userId,
        msg: 'Error storing refresh token',
      });
      throw error;
    }
  };

  const validateRefreshToken = async (
    userId: string,
    token: string
  ): Promise<boolean> => {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    try {
      const result = await dynamodb.send(
        new QueryCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          IndexName: 'gsi1-index',
          KeyConditionExpression: 'gsi1_pk = :tokenHash AND gsi1_sk = :userId',
          ExpressionAttributeValues: {
            ':tokenHash': `TOKEN#${tokenHash}`,
            ':userId': `USER#${userId}`,
          },
        })
      );

      if (!result.Items || result.Items.length === 0) {
        logger.warn({ userId, msg: 'Refresh token not found' });
        return false;
      }

      const tokenItem = result.Items[0] as DynamoDBRefreshTokenItem;

      // Check if revoked
      if (tokenItem.isRevoked) {
        logger.warn({
          userId,
          tokenId: tokenItem.tokenId,
          msg: 'Token is revoked',
        });
        return false;
      }

      if (new Date(tokenItem.expiresAt) < new Date()) {
        logger.warn({
          userId,
          tokenId: tokenItem.tokenId,
          msg: 'Token is expired',
        });
        return false;
      }

      // Update lastUsedAt timestamp
      await dynamodb.send(
        new UpdateCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          Key: {
            pk: tokenItem.pk,
            sk: tokenItem.sk,
          },
          UpdateExpression: 'SET lastUsedAt = :lastUsedAt',
          ExpressionAttributeValues: {
            ':lastUsedAt': new Date().toISOString(),
          },
        })
      );

      return true;
    } catch (error) {
      logger.error({
        error,
        userId,
        msg: 'Error validating refresh token (Database Error)',
      });
      throw error;
    }
  };

  const revokeRefreshToken = async (
    userId: string,
    tokenId: string,
    reason: 'user_logout' | 'security' | 'replaced' | 'expired' = 'user_logout'
  ): Promise<void> => {
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          Key: {
            pk: `USER#${userId}`,
            sk: `REFRESH_TOKEN#${tokenId}`,
          },
          // Ensure the item exists before attempting to update it
          ConditionExpression: 'attribute_exists(pk)',
          UpdateExpression:
            'SET isRevoked = :isRevoked, revokedAt = :revokedAt, revokedReason = :reason',
          ExpressionAttributeValues: {
            ':isRevoked': true,
            ':revokedAt': new Date().toISOString(),
            ':reason': reason,
          },
        })
      );

      logger.info({ userId, tokenId, reason, msg: 'Refresh token revoked' });
    } catch (error) {
      logger.error({
        error,
        userId,
        tokenId,
        msg: 'Error revoking refresh token',
      });
      throw error;
    }
  };

  const revokeRefreshTokenByHash = async (
    userId: string,
    token: string,
    reason: 'user_logout' | 'security' | 'replaced' | 'expired' = 'replaced'
  ): Promise<void> => {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    try {
      const result = await dynamodb.send(
        new QueryCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          IndexName: 'gsi1-index',
          KeyConditionExpression: 'gsi1_pk = :tokenHash AND gsi1_sk = :userId',
          ExpressionAttributeValues: {
            ':tokenHash': `TOKEN#${tokenHash}`,
            ':userId': `USER#${userId}`,
          },
        })
      );

      if (!result.Items || result.Items.length === 0) {
        logger.warn({ userId, msg: 'Token not found for revocation' });
        return;
      }

      const tokenItem = result.Items[0] as DynamoDBRefreshTokenItem;

      await revokeRefreshToken(userId, tokenItem.tokenId, reason);

      logger.info({
        userId,
        tokenId: tokenItem.tokenId,
        reason,
        msg: 'Refresh token revoked by hash',
      });
    } catch (error) {
      logger.error({
        error,
        userId,
        msg: 'Error revoking refresh token by hash',
      });
      throw error;
    }
  };

  return {
    storeRefreshToken,
    validateRefreshToken,
    revokeRefreshToken,
    revokeRefreshTokenByHash,
  };
};
