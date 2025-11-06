import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBNotificationItem } from '../models/notification.js';

export const createNotificationRepository = (fastify: FastifyInstance) => {
  const dynamodb = DynamoDBDocumentClient.from(
    fastify.dynamodb as DynamoDBClient
  );
  const { log: logger } = fastify;

  const createNotification = async (
    userId: string,
    notificationType: 'friend_request_accepted' | 'challenge_accepted',
    relatedUserId: string
  ): Promise<DynamoDBNotificationItem> => {
    const notificationId = uuidv4();
    const now = new Date().toISOString();

    const notification: DynamoDBNotificationItem = {
      pk: `USER#${userId}`,
      sk: `NOTIFICATION#${notificationId}`,
      EntityType: 'Notification',
      notificationId,
      notificationType,
      relatedUserId,
      createdAt: now,
    };

    try {
      await dynamodb.send(
        new PutCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          Item: notification,
        })
      );

      logger.info({
        notificationId,
        userId,
        notificationType,
        relatedUserId,
        msg: 'Notification created successfully',
      });

      return notification;
    } catch (error) {
      logger.error({
        error,
        userId,
        notificationType,
        relatedUserId,
        msg: 'Error creating notification',
      });
      throw error;
    }
  };

  const getUserNotifications = async (
    userId: string
  ): Promise<DynamoDBNotificationItem[]> => {
    try {
      const result = await dynamodb.send(
        new QueryCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':prefix': 'NOTIFICATION#',
          },
        })
      );

      return (result.Items || []) as DynamoDBNotificationItem[];
    } catch (error) {
      logger.error({
        error,
        userId,
        msg: 'Error fetching user notifications',
      });
      throw error;
    }
  };

  const markNotificationAsRead = async (
    userId: string,
    notificationId: string
  ): Promise<void> => {
    const now = new Date().toISOString();

    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          Key: {
            pk: `USER#${userId}`,
            sk: `NOTIFICATION#${notificationId}`,
          },
          UpdateExpression: 'SET readAt = :readAt',
          ExpressionAttributeValues: {
            ':readAt': now,
          },
        })
      );

      logger.info({
        notificationId,
        userId,
        msg: 'Notification marked as read',
      });
    } catch (error) {
      logger.error({
        error,
        notificationId,
        userId,
        msg: 'Error marking notification as read',
      });
      throw error;
    }
  };

  return {
    createNotification,
    getUserNotifications,
    markNotificationAsRead,
  };
};
