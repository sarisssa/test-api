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
    // Build filter expression: search in name/Symbol, and filter by EntityType=Asset to reduce scan size
    // Since DynamoDB contains() is case-sensitive, we search with multiple case variations
    const upperSearchTerm = searchTerm.toUpperCase();
    const lowerSearchTerm = searchTerm.toLowerCase();
    const titleCaseSearchTerm =
      searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();

    let filterExpression =
      'EntityType = :entityType AND (contains(#sym, :symSearch) OR contains(#n, :nameSearchOriginal) OR contains(#n, :nameSearchUpper) OR contains(#n, :nameSearchLower) OR contains(#n, :nameSearchTitle))';
    const expressionAttributeNames: Record<string, string> = {
      '#n': 'name',
      '#sym': 'Symbol',
    };
    const expressionAttributeValues: Record<string, any> = {
      ':symSearch': upperSearchTerm,
      ':nameSearchOriginal': searchTerm,
      ':nameSearchUpper': upperSearchTerm,
      ':nameSearchLower': lowerSearchTerm,
      ':nameSearchTitle': titleCaseSearchTerm,
      ':entityType': 'Asset',
    };

    if (assetType) {
      filterExpression += ' AND AssetType = :at';
      expressionAttributeValues[':at'] = assetType;
    }

    try {
      const results: DynamoDBAssetItem[] = [];
      let lastEvaluatedKey: Record<string, any> | undefined;

      // Paginate through all results until we have enough matches
      do {
        const params: ScanCommand['input'] = {
          TableName: fastify.config.DYNAMODB_TABLE_NAME,
          FilterExpression: filterExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ExclusiveStartKey: lastEvaluatedKey,
        };

        const result = await fastify.dynamodb.send(new ScanCommand(params));
        const items = (result.Items || []) as DynamoDBAssetItem[];
        results.push(...items);

        lastEvaluatedKey = result.LastEvaluatedKey;

        // Stop if we have enough results
        if (results.length >= limit) {
          break;
        }
      } while (lastEvaluatedKey);

      logger.info({
        searchTerm,
        assetType,
        limit,
        returnedCount: results.length,
        msg: 'Asset search completed',
      });

      return results.slice(0, limit);
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

      logger.info({
        ticker: upperTicker,
        hasItem: !!result.Item,
        itemKeys: result.Item ? Object.keys(result.Item) : [],
        symbol: result.Item?.Symbol,
        itemStringified: JSON.stringify(result.Item),
        msg: 'Fetched asset by ticker',
      });

      if (result.Item) {
        const assetItem = result.Item as DynamoDBAssetItem;
        logger.info({
          ticker: upperTicker,
          castedItemKeys: Object.keys(assetItem),
          castedItemStringified: JSON.stringify(assetItem),
          msg: 'Repository: Returning casted item',
        });
        return assetItem;
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
