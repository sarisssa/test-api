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
import {
  DynamoDBFriendItem,
  DynamoDBFriendRequestItem,
} from '../models/friend.js';

export const createFriendRepository = (fastify: FastifyInstance) => {
  const dynamodb = DynamoDBDocumentClient.from(
    fastify.dynamodb as DynamoDBClient
  );
  const { log: logger } = fastify;

  const checkExistingRequest = async (
    senderId: string,
    receiverId: string
  ): Promise<boolean> => {
    try {
      const allRequests = await getUserRequests(senderId);

      const hasOutgoing = allRequests.some(
        r => r.receiverId === receiverId && r.status === 'PENDING'
      );
      const hasIncoming = allRequests.some(
        r => r.senderId === receiverId && r.status === 'PENDING'
      );

      return hasOutgoing || hasIncoming;
    } catch (error) {
      logger.error({
        error,
        senderId,
        receiverId,
        msg: 'Error checking existing friend request',
      });
      throw error;
    }
  };
  const createFriendRequest = async (
    senderId: string,
    receiverId: string
  ): Promise<DynamoDBFriendRequestItem> => {
    const existingFriendships = await getUserFriends(senderId);
    const isAlreadyFriend = existingFriendships.some(
      f => f.friendId === receiverId
    );
    if (isAlreadyFriend) {
      throw new Error('Users are already friends');
    }

    // Check for existing requests
    const hasExisting = await checkExistingRequest(senderId, receiverId);
    if (hasExisting) {
      throw new Error('Friend request already exists between these users');
    }

    const requestId = uuidv4();
    const now = new Date().toISOString();

    // Create two items - one for sender's outgoing view, one for receiver's incoming view
    const senderRequest: DynamoDBFriendRequestItem = {
      pk: `USER#${senderId}`,
      sk: `REQUEST#${requestId}`,
      EntityType: 'FriendRequest',
      requestId,
      senderId,
      receiverId,
      status: 'PENDING',
      requestedAt: now,
      updatedAt: now,
      gsi1_pk: `SENDER#${senderId}`,
      gsi1_sk: `REQUEST#${requestId}`,
    };

    const receiverRequest: DynamoDBFriendRequestItem = {
      pk: `USER#${receiverId}`,
      sk: `REQUEST#${requestId}`,
      EntityType: 'FriendRequest',
      requestId,
      senderId,
      receiverId,
      status: 'PENDING',
      requestedAt: now,
      updatedAt: now,
      gsi1_pk: `RECEIVER#${receiverId}`,
      gsi1_sk: `REQUEST#${requestId}`,
    };

    try {
      // Write both items in a batch
      logger.info({
        senderRequest,
        receiverRequest,
        msg: 'Creating friend request items',
      });

      await Promise.all([
        dynamodb.send(
          new PutCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Item: senderRequest,
            ConditionExpression:
              'attribute_not_exists(pk) AND attribute_not_exists(sk)',
          })
        ),
        dynamodb.send(
          new PutCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Item: receiverRequest,
            ConditionExpression:
              'attribute_not_exists(pk) AND attribute_not_exists(sk)',
          })
        ),
      ]);

      return senderRequest;
    } catch (error) {
      logger.error({
        error,
        senderId,
        receiverId,
        msg: 'Error creating friend request',
      });
      throw error;
    }
  };

  const getFriendRequest = async (
    requestId: string
  ): Promise<DynamoDBFriendRequestItem | null> => {
    try {
      logger.info({
        requestId,
        msg: 'Looking up friend request',
      });

      // First try to find all items with this request ID
      const result = await dynamodb.send(
        new ScanCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          FilterExpression: 'contains(sk, :requestId)',
          ExpressionAttributeValues: {
            ':requestId': requestId,
          },
        })
      );

      return (result.Items?.[0] as DynamoDBFriendRequestItem) || null;
    } catch (error) {
      logger.error({
        error,
        requestId,
        msg: 'Error fetching friend request',
      });
      throw error;
    }
  };

  const getUserRequests = async (
    userId: string
  ): Promise<DynamoDBFriendRequestItem[]> => {
    try {
      // Query both incoming and outgoing requests in parallel
      const [outgoingResult, incomingResult] = await Promise.all([
        dynamodb.send(
          new QueryCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            IndexName: 'gsi1-index',
            KeyConditionExpression:
              'gsi1_pk = :userKey AND begins_with(gsi1_sk, :prefix)',
            ExpressionAttributeValues: {
              ':userKey': `SENDER#${userId}`,
              ':prefix': 'REQUEST#',
              ':status': 'PENDING',
            },
            FilterExpression: '#status = :status',
            ExpressionAttributeNames: {
              '#status': 'status',
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
              ':userKey': `RECEIVER#${userId}`,
              ':prefix': 'REQUEST#',
              ':status': 'PENDING',
            },
            FilterExpression: '#status = :status',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
          })
        ),
      ]);

      const outgoing = (outgoingResult.Items ||
        []) as DynamoDBFriendRequestItem[];
      const incoming = (incomingResult.Items ||
        []) as DynamoDBFriendRequestItem[];

      return [...outgoing, ...incoming];
    } catch (error) {
      logger.error({
        error,
        userId,
        msg: 'Error fetching user requests',
      });
      throw error;
    }
  };

  const deleteFriendRequest = async (requestId: string): Promise<void> => {
    const request = await getFriendRequest(requestId);
    if (!request) return;

    try {
      // Delete both sender and receiver items
      await Promise.all([
        dynamodb.send(
          new DeleteCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Key: {
              pk: `USER#${request.senderId}`,
              sk: `REQUEST#${request.requestId}`,
            },
          })
        ),
        dynamodb.send(
          new DeleteCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Key: {
              pk: `USER#${request.receiverId}`,
              sk: `REQUEST#${request.requestId}`,
            },
          })
        ),
      ]);

      logger.info({
        requestId,
        msg: 'Friend request deleted successfully',
      });
    } catch (error) {
      logger.error({
        error,
        requestId,
        msg: 'Error deleting friend request',
      });
      throw error;
    }
  };

  const createFriendship = async (
    userId1: string,
    userId2: string
  ): Promise<void> => {
    const now = new Date().toISOString();

    const friendship1: DynamoDBFriendItem = {
      pk: `USER#${userId1}`,
      sk: `FRIEND#${userId2}`,
      EntityType: 'Friend',
      friendId: userId2,
      friendSince: now,
      updatedAt: now,
    };

    const friendship2: DynamoDBFriendItem = {
      pk: `USER#${userId2}`,
      sk: `FRIEND#${userId1}`,
      EntityType: 'Friend',
      friendId: userId1,
      friendSince: now,
      updatedAt: now,
    };

    try {
      await Promise.all([
        dynamodb.send(
          new PutCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Item: friendship1,
          })
        ),
        dynamodb.send(
          new PutCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Item: friendship2,
          })
        ),
      ]);

      logger.info({
        userId1,
        userId2,
        msg: 'Friendship created successfully',
      });
    } catch (error) {
      logger.error({
        error,
        userId1,
        userId2,
        msg: 'Error creating friendship',
      });
      throw error;
    }
  };

  const getUserFriends = async (
    userId: string
  ): Promise<DynamoDBFriendItem[]> => {
    try {
      const result = await dynamodb.send(
        new QueryCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':prefix': 'FRIEND#',
          },
        })
      );

      return (result.Items || []) as DynamoDBFriendItem[];
    } catch (error) {
      logger.error({
        error,
        userId,
        msg: 'Error fetching user friends',
      });
      throw error;
    }
  };

  const deleteFriendship = async (
    userId: string,
    friendId: string
  ): Promise<void> => {
    try {
      await Promise.all([
        dynamodb.send(
          new DeleteCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Key: {
              pk: `USER#${userId}`,
              sk: `FRIEND#${friendId}`,
            },
          })
        ),
        dynamodb.send(
          new DeleteCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Key: {
              pk: `USER#${friendId}`,
              sk: `FRIEND#${userId}`,
            },
          })
        ),
      ]);

      logger.info({
        userId,
        friendId,
        msg: 'Friendship deleted successfully',
      });
    } catch (error) {
      logger.error({
        error,
        userId,
        friendId,
        msg: 'Error deleting friendship',
      });
      throw error;
    }
  };

  const markFriendRequestAsRead = async (
    userId: string,
    requestId: string
  ): Promise<void> => {
    const request = await getFriendRequest(requestId);
    if (!request) {
      throw new Error('Friend request not found');
    }

    if (request.receiverId !== userId) {
      throw new Error('User is not authorized to mark this request as read');
    }

    const now = new Date().toISOString();

    try {
      // Update both items (sender and receiver copies) to maintain consistency
      await Promise.all([
        dynamodb.send(
          new PutCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Item: {
              ...request,
              pk: `USER#${request.senderId}`,
              sk: `REQUEST#${requestId}`,
              gsi1_pk: `SENDER#${request.senderId}`,
              gsi1_sk: `REQUEST#${requestId}`,
              readAt: now,
              updatedAt: now,
            },
          })
        ),
        dynamodb.send(
          new PutCommand({
            TableName: fastify.config.DYNAMODB_TABLE_NAME,
            Item: {
              ...request,
              pk: `USER#${request.receiverId}`,
              sk: `REQUEST#${requestId}`,
              gsi1_pk: `RECEIVER#${request.receiverId}`,
              gsi1_sk: `REQUEST#${requestId}`,
              readAt: now,
              updatedAt: now,
            },
          })
        ),
      ]);
    } catch (error) {
      logger.error({
        error,
        requestId,
        userId,
        msg: 'Error marking friend request as read',
      });
      throw error;
    }
  };

  return {
    createFriendRequest,
    getFriendRequest,
    getUserRequests,
    deleteFriendRequest,
    createFriendship,
    getUserFriends,
    deleteFriendship,
    markFriendRequestAsRead,
  };
};
