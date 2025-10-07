import { GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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
      TableName: fastify.config.DYNAMODB_TABLE_NAME,
      FilterExpression: 'contains(sk, :s) OR contains(#n, :s)',
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
    const upperTicker = ticker.toUpperCase();
    const key = {
      pk: `ASSET#${upperTicker}`,
      sk: 'METADATA',
    };

    try {
      const result = await fastify.dynamodb.send(
        new GetCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          Key: key,
        })
      );

      if (result.Item) {
        return result.Item as DynamoDBAssetItem;
      }
      return null;
    } catch (error) {
      logger.error({
        error,
        ticker: upperTicker,
        msg: 'Error fetching asset by ticker',
      });
      throw error;
    }
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

  const updateAssetPrice = async (
    ticker: string,
    currentPrice: number,
    lastUpdated: string
  ): Promise<void> => {
    try {
      await fastify.dynamodb.send(
        new UpdateCommand({
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          Key: {
            pk: `ASSET#${ticker.toUpperCase()}`,
            sk: 'METADATA',
          },
          UpdateExpression: 'SET currentPrice = :price, lastUpdated = :updated',
          ExpressionAttributeValues: {
            ':price': currentPrice,
            ':updated': lastUpdated,
          },
        })
      );

      logger.info({
        ticker,
        currentPrice,
        lastUpdated,
        msg: 'Asset price updated in DynamoDB',
      });
    } catch (error) {
      logger.error({
        error,
        ticker,
        currentPrice,
        msg: 'Error updating asset price in DynamoDB',
      });
      throw error;
    }
  };

  return {
    searchAssets,
    fetchAssetByTickerFromDB,
    getAssetDetailsByTicker,
    updateAssetPrice,
  };
};
