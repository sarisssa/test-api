import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { DynamoDBRefreshTokenItem } from '../models/auth.js';

const buildKey = (hashedToken: string) => ({
  pk: `REFRESH#${hashedToken}` as const,
  sk: 'REFRESH' as const,
});

const normaliseItem = (
  item: DynamoDBRefreshTokenItem
): DynamoDBRefreshTokenItem => {
  return {
    ...item,
    pk: item.pk,
    sk: item.sk,
  };
};

export const createRefreshTokenRepository = (fastify: FastifyInstance) => {
  const dynamodb = DynamoDBDocumentClient.from(
    fastify.dynamodb as DynamoDBClient
  );
  const { log: logger } = fastify;

  const persistRefreshToken = async (
    item: DynamoDBRefreshTokenItem
  ): Promise<void> => {
    const key = buildKey(item.hashedToken);

    const record: DynamoDBRefreshTokenItem = normaliseItem({
      ...item,
      pk: key.pk,
      sk: key.sk,
    });

    await dynamodb.send(
      new PutCommand({
        TableName: fastify.config.DYNAMODB_TABLE_NAME,
        Item: record,
      })
    );

    logger.info({
      hashedToken: item.hashedToken,
      userId: item.userId,
      msg: 'Persisted refresh token',
    });
  };

  const getRefreshTokenByHash = async (
    hashedToken: string
  ): Promise<DynamoDBRefreshTokenItem | undefined> => {
    const key = buildKey(hashedToken);

    const result = await dynamodb.send(
      new GetCommand({
        TableName: fastify.config.DYNAMODB_TABLE_NAME,
        Key: {
          pk: key.pk,
          sk: key.sk,
        },
      })
    );

    const item = result.Item as DynamoDBRefreshTokenItem | undefined;
    return item ? normaliseItem(item) : undefined;
  };

  const deleteRefreshTokenByHash = async (
    hashedToken: string
  ): Promise<void> => {
    const key = buildKey(hashedToken);

    await dynamodb.send(
      new DeleteCommand({
        TableName: fastify.config.DYNAMODB_TABLE_NAME,
        Key: {
          pk: key.pk,
          sk: key.sk,
        },
      })
    );

    logger.info({
      hashedToken,
      msg: 'Deleted refresh token',
    });
  };

  return {
    persistRefreshToken,
    getRefreshTokenByHash,
    deleteRefreshTokenByHash,
  };
};
