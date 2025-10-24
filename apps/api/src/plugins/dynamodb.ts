import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
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
  const dynamodbClient = new DynamoDBClient({
    region: fastify.config.AWS_REGION,
    ...(fastify.config.DYNAMODB_URL && {
      endpoint: fastify.config.DYNAMODB_URL,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
      },
    }),
  });

  const dynamodb = DynamoDBDocumentClient.from(dynamodbClient);

  try {
    await dynamodbClient.send(
      new DescribeTableCommand({
        TableName: fastify.config.DYNAMODB_TABLE_NAME,
      })
    );
    fastify.log.info(`DynamoDB connected to ${fastify.config.AWS_REGION}`);
  } catch (error) {
    fastify.log.error({ error }, 'DynamoDB connection failed:');
    throw error;
  }

  fastify.decorate('dynamodb', dynamodb);

  fastify.addHook('onClose', async () => {
    dynamodbClient.destroy();
  });
}

export default fp(dynamodbPlugin);
