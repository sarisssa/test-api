import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { DynamoDBAssetItem } from '../models/asset.js';
import { AssetType } from '../types/match.js';

export const createAssetRepository = (fastify: FastifyInstance) => {
  const { log: logger } = fastify;

  const searchAssets = async (
    searchTerm: string,
    assetType?: AssetType,
    limit: number = 20
  ): Promise<DynamoDBAssetItem[]> => {
    const params: ScanCommand['input'] = {
      TableName: 'WageTable',
      FilterExpression: 'contains(Symbol, :s) OR contains(#n, :s)',
      ExpressionAttributeNames: {
        '#n': 'name',
      },
      ExpressionAttributeValues: {
        ':s': searchTerm,
      },
      Limit: limit,
    };

    if (assetType) {
      params.FilterExpression += ' AND AssetType = :at';
      params.ExpressionAttributeValues![':at'] = assetType;
    }

    try {
      const { Items } = await fastify.dynamodb.send(new ScanCommand(params));
      return (Items || []) as DynamoDBAssetItem[];
    } catch (error) {
      logger.error({
        error,
        searchTerm,
        assetType,
        msg: 'Error searching assets in DynamoDB',
      });
      throw error;
    }
  };

  const fetchAssetBySymbol = async (
    symbol: string
  ): Promise<DynamoDBAssetItem | null> => {
    const assetTypes = ['STOCK', 'CRYPTO', 'COMMODITY'];

    for (const assetType of assetTypes) {
      try {
        const result = await fastify.dynamodb.send(
          new GetCommand({
            TableName: 'WageTable',
            Key: {
              PK: `ASSET#${assetType}`,
              SK: symbol,
            },
          })
        );

        if (result.Item) {
          return result.Item as DynamoDBAssetItem;
        }
      } catch (error) {
        logger.error({
          error,
          symbol,
          assetType,
          msg: 'Error fetching asset by symbol',
        });
        throw error;
      }
    }

    return null;
  };

  return {
    searchAssets,
    fetchAssetBySymbol,
  };
};
