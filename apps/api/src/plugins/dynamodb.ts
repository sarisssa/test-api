import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    dynamodb: DynamoDBDocumentClient;
    config: Env;
  }
}

async function dynamodbPlugin(fastify: FastifyInstance) {
  // For local development (when DYNAMODB_URL points to localhost), use our LocalStack
  // For cloud (when DYNAMODB_URL is empty), use AWS DynamoDB
  const url = fastify.config.DYNAMODB_URL || '';
  const isLocalDevelopment = Boolean(
    url && (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0'))
  );

  const dynamodbClient = new DynamoDBClient({
    region: fastify.config.DYNAMODB_REGION,
    ...(isLocalDevelopment && {
      endpoint: fastify.config.DYNAMODB_URL,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    }),
  });

  const dynamodb = DynamoDBDocumentClient.from(dynamodbClient);

  try {
    await dynamodbClient.send(new ListTablesCommand({}));
    if (isLocalDevelopment) {
      fastify.log.info(`DynamoDB connected to LocalStack at ${fastify.config.DYNAMODB_URL}`);
    } else {
      fastify.log.info('DynamoDB connected to AWS');
    }
  } catch (error) {
    fastify.log.error({ error, endpoint: fastify.config.DYNAMODB_URL }, 'DynamoDB connection failed');
    throw error;
  }

  fastify.decorate('dynamodb', dynamodb);

  fastify.addHook('onClose', async () => {
    dynamodbClient.destroy();
  });
}

export default fp(dynamodbPlugin);
