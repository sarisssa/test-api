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
  PK: `REFRESH#${hashedToken}` as const,
  SK: 'REFRESH' as const,
});

const normaliseItem = (item: DynamoDBRefreshTokenItem): DynamoDBRefreshTokenItem => {
  const pk = item.pk ?? (item.PK as `REFRESH#${string}`);
  const sk = item.sk ?? (item.SK as 'REFRESH' | undefined) ?? 'REFRESH';

  return {
    ...item,
    pk,
    sk,
    PK: (item.PK ?? pk) as `REFRESH#${string}`,
    SK: (item.SK ?? sk) as 'REFRESH',
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
      pk: key.PK,
      sk: key.SK,
      PK: key.PK,
      SK: key.SK,
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
          PK: key.PK,
          SK: key.SK,
        },
      })
    );

    let item = result.Item as DynamoDBRefreshTokenItem | undefined;

    if (!item) {
      const legacyResult = await dynamodb.send(
        new GetCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          Key: {
            pk: key.PK,
            sk: key.SK,
          },
        })
      );
      item = legacyResult.Item as DynamoDBRefreshTokenItem | undefined;
    }

    return item ? normaliseItem(item) : undefined;
  };

  const deleteRefreshTokenByHash = async (hashedToken: string): Promise<void> => {
    const key = buildKey(hashedToken);

    await dynamodb.send(
      new DeleteCommand({
        TableName: fastify.config.DYNAMODB_TABLE_NAME,
        Key: {
          PK: key.PK,
          SK: key.SK,
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
