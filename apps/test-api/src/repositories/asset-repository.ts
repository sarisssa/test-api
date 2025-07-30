import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { REDIS_KEYS } from '../constants.js';
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

  const fetchAssetByTickerFromDB = async (
    ticker: string
  ): Promise<DynamoDBAssetItem | null> => {
    const assetTypes = ['STOCK', 'CRYPTO', 'COMMODITY'];

    for (const assetType of assetTypes) {
      try {
        const result = await fastify.dynamodb.send(
          new GetCommand({
            TableName: 'WageTable',
            Key: {
              PK: `ASSET#${assetType}`,
              SK: ticker,
            },
          })
        );

        if (result.Item) {
          return result.Item as DynamoDBAssetItem;
        }
      } catch (error) {
        logger.error({
          error,
          ticker,
          assetType,
          msg: 'Error fetching asset by ticker',
        });
        throw error;
      }
    }

    return null;
  };

  const getAssetDetailsByTicker = async (
    ticker: string
  ): Promise<{ exists: boolean; assetType: AssetType | null }> => {
    const redis = fastify.redis;
    const cacheKey = REDIS_KEYS.ASSET_TICKER(ticker);
    const CACHE_TTL = 86400; // 24 hours in seconds

    try {
      const cachedResult = await redis.get(cacheKey);
      if (cachedResult) {
        logger.info({
          ticker,
          msg: 'Asset ticker found in Redis cache',
        });

        if (cachedResult === 'NOT_FOUND') {
          return { exists: false, assetType: null };
        }

        if (Object.values(AssetType).includes(cachedResult as AssetType)) {
          return {
            exists: true,
            assetType: cachedResult as AssetType,
          };
        }

        logger.warn({
          ticker,
          cachedResult,
          msg: 'Invalid cached asset type, falling back to DynamoDB',
        });
      }

      logger.info({
        ticker,
        msg: 'Asset ticker not in cache, checking DynamoDB',
      });

      const asset = await fetchAssetByTickerFromDB(ticker);

      if (asset) {
        await redis.setex(cacheKey, CACHE_TTL, asset.AssetType);
        logger.info({
          ticker,
          assetType: asset.AssetType,
          msg: 'Asset ticker found in DynamoDB and cached',
        });

        return {
          exists: true,
          assetType: asset.AssetType as AssetType,
        };
      } else {
        // Cache the negative result (ticker doesn't exist)
        await redis.setex(cacheKey, CACHE_TTL, 'NOT_FOUND');
        logger.info({
          ticker,
          msg: 'Asset ticker not found in DynamoDB, cached negative result',
        });

        return { exists: false, assetType: null };
      }
    } catch (error) {
      logger.error({
        error,
        ticker,
        msg: 'Error in lookupTickerWithCache',
      });
      throw error;
    }
  };

  return {
    searchAssets,
    fetchAssetByTickerFromDB,
    getAssetDetailsByTicker,
  };
};
