import { FastifyInstance } from 'fastify';
import { DynamoDBAssetItem } from '../models/asset.js';
import { AssetType } from '../types/match.js';

export const findAssets = async (
  fastify: FastifyInstance,
  searchTerm: string,
  assetType?: AssetType,
  limit: number = 20
): Promise<DynamoDBAssetItem[]> => {
  try {
    return await fastify.repositories.asset.searchAssets(
      searchTerm,
      assetType,
      limit
    );
  } catch (error) {
    fastify.log.error({
      searchTerm,
      assetType,
      limit,
      error,
      msg: 'Error in findAssets service',
    });
    throw error;
  }
};

export const getAssetByTicker = async (
  fastify: FastifyInstance,
  ticker: string
): Promise<DynamoDBAssetItem | null> => {
  try {
    return await fastify.repositories.asset.fetchAssetByTickerFromDB(ticker);
  } catch (error) {
    fastify.log.error({
      ticker,
      error,
      msg: 'Error in getAssetBySymbol service',
    });
    throw error;
  }
};

export const validateTickerSymbol = async (
  fastify: FastifyInstance,
  ticker: string
): Promise<{ exists: boolean; assetType: AssetType | null }> => {
  try {
    return await fastify.repositories.asset.getAssetDetailsByTicker(ticker);
  } catch (error) {
    fastify.log.error({
      ticker,
      error,
      msg: 'Error in validateTickerSymbol service',
    });
    throw error;
  }
};
