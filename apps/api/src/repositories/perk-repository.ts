import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { DynamoDBPerkItem } from '../models/perk.js';

export const createPerkRepository = (fastify: FastifyInstance) => {
  const { log: logger } = fastify;

  const getAllPerks = async (): Promise<DynamoDBPerkItem[]> => {
    try {
      const result = await fastify.dynamodb.send(
        new ScanCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          FilterExpression: 'EntityType = :entityType',
          ExpressionAttributeValues: {
            ':entityType': 'Perk',
          },
        })
      );

      return (result.Items || []) as DynamoDBPerkItem[];
    } catch (error) {
      logger.error({
        error,
        msg: 'Error fetching all perks from DynamoDB',
      });
      throw error;
    }
  };

  const getPerkById = async (
    perkId: string
  ): Promise<DynamoDBPerkItem | null> => {
    try {
      const getParams = {
        TableName: fastify.config.DYNAMODB_TABLE_NAME,
        Key: {
          pk: `PERK#${perkId.toUpperCase()}`,
          sk: 'METADATA',
        },
      };

      const result = await fastify.dynamodb.send(new GetCommand(getParams));

      return (result.Item as DynamoDBPerkItem) || null;
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
        perkId,
        msg: 'Error fetching perk by ID from DynamoDB',
      });
      throw error;
    }
  };

  return {
    getAllPerks,
    getPerkById,
  };
};
