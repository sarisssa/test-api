import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    dynamodb: DynamoDBDocumentClient;
  }
}

async function dynamodbPlugin(fastify: FastifyInstance) {
  const dynamodbClient = new DynamoDBClient({
    region: fastify.config.DYNAMODB_REGION,
    endpoint: fastify.config.DYNAMODB_URL,
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
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
