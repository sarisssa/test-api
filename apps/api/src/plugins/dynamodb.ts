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
  const dynamodbClient = new DynamoDBClient({
    region: fastify.config.DYNAMODB_REGION,
  });

  const dynamodb = DynamoDBDocumentClient.from(dynamodbClient);

  try {
    await dynamodbClient.send(new ListTablesCommand({}));
    fastify.log.info(`DynamoDB connected to ${fastify.config.DYNAMODB_URL}`);
  } catch (error) {
    fastify.log.error('DynamoDB connection failed:', error);
    throw error;
  }

  fastify.decorate('dynamodb', dynamodb);

  fastify.addHook('onClose', async () => {
    dynamodbClient.destroy();
  });
}

export default fp(dynamodbPlugin);
