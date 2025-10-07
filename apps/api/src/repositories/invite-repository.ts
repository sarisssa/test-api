import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { DynamoDBInviteItem } from '../models/invite.js';

export const createInviteRepository = (fastify: FastifyInstance) => {
  const { log: logger } = fastify;

  const createInvite = async (
    senderId: string,
    inviteCode: string,
    receiverContactHash: string = ''
  ): Promise<DynamoDBInviteItem> => {
    const invite: DynamoDBInviteItem = {
      pk: `USER#${senderId}`,
      sk: `INVITE#${inviteCode}`,
      EntityType: 'Invite',
      inviteCode,
      senderId,
      receiverContactHash,
      status: 'SENT',
      createdAt: new Date().toISOString(),
    };

    try {
      await fastify.dynamodb.send(
        new PutCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          Item: invite,
        })
      );

      logger.info({
        senderId,
        inviteCode,
        msg: 'Invite created successfully',
      });

      return invite;
    } catch (error) {
      logger.error({
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        senderId,
        inviteCode,
        msg: 'Error creating invite',
      });
      throw error;
    }
  };

  const getInviteByCode = async (
    inviteCode: string
  ): Promise<DynamoDBInviteItem | null> => {
    try {
      // Note: This requires a scan since we don't know the senderId
      // In production, consider adding a GSI with inviteCode as PK
      const result = await fastify.dynamodb.send(
        new QueryCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          IndexName: 'InviteCodeIndex', // Assumes GSI exists
          KeyConditionExpression: 'inviteCode = :inviteCode',
          ExpressionAttributeValues: {
            ':inviteCode': inviteCode,
          },
        })
      );

      if (result.Items && result.Items.length > 0) {
        return result.Items[0] as DynamoDBInviteItem;
      }

      return null;
    } catch (error) {
      logger.error({
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        inviteCode,
        msg: 'Error fetching invite by code',
      });
      throw error;
    }
  };

  const getUserInvites = async (
    userId: string
  ): Promise<DynamoDBInviteItem[]> => {
    try {
      const result = await fastify.dynamodb.send(
        new QueryCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':skPrefix': 'INVITE#',
          },
        })
      );

      return (result.Items || []) as DynamoDBInviteItem[];
    } catch (error) {
      logger.error({
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        userId,
        msg: 'Error fetching user invites',
      });
      throw error;
    }
  };

  const updateInviteStatus = async (
    senderId: string,
    inviteCode: string,
    status: 'SENT' | 'ACCEPTED'
  ): Promise<void> => {
    try {
      await fastify.dynamodb.send(
        new PutCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          Item: {
            pk: `USER#${senderId}`,
            sk: `INVITE#${inviteCode}`,
            status,
          },
          ConditionExpression: 'attribute_exists(pk)',
        })
      );

      logger.info({
        senderId,
        inviteCode,
        status,
        msg: 'Invite status updated',
      });
    } catch (error) {
      logger.error({
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        senderId,
        inviteCode,
        status,
        msg: 'Error updating invite status',
      });
      throw error;
    }
  };

  return {
    createInvite,
    getInviteByCode,
    getUserInvites,
    updateInviteStatus,
  };
};
