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

export const getAssetBySymbol = async (
  fastify: FastifyInstance,
  symbol: string
): Promise<DynamoDBAssetItem | null> => {
  try {
    return await fastify.repositories.asset.fetchAssetBySymbol(symbol);
  } catch (error) {
    fastify.log.error({
      symbol,
      error,
      msg: 'Error in getAssetBySymbol service',
    });
    throw error;
  }
};
