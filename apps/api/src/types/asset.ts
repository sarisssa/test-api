import { AssetType } from './match.js';

export interface GetAssetParams {
  symbol: string;
}

export interface AssetSearchQuery {
  search?: string;
  type?: AssetType;
  limit?: number;
}

export const getAssetParamsJsonSchema = {
  type: 'object',
  properties: {
    symbol: {
      type: 'string',
      pattern: '^[A-Za-z0-9/_.-]+$',
      minLength: 1,
      maxLength: 20,
    },
  },
  required: ['symbol'],
  additionalProperties: false,
} as const;

export const assetSearchQueryJsonSchema = {
  type: 'object',
  properties: {
    search: { type: 'string' },
    type: {
      type: 'string',
      enum: ['STOCK', 'CRYPTO', 'COMMODITY'],
    },
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 100,
    },
  },
  additionalProperties: false,
} as const;

export const assetsResponseJsonSchema = {
  description: 'List of assets matching search criteria',
  type: 'array',
  items: {
    type: 'object',
    properties: {
      pk: { type: 'string', description: 'Partition key (ASSET#SYMBOL)' },
      sk: { type: 'string', description: 'Sort key' },
      EntityType: { type: 'string', enum: ['Asset'] },
      AssetType: { type: 'string', enum: ['STOCK', 'CRYPTO', 'COMMODITY'] },
      Symbol: { type: 'string', description: 'Asset ticker symbol' },
      name: { type: 'string', description: 'Asset name' },
      currentPrice: {
        type: 'number',
        description: 'Current price of the asset',
      },
      lastUpdated: {
        type: 'string',
        description: 'ISO timestamp of last price update',
      },
      description: { type: 'string', description: 'Asset description' },
      marketCap: { type: 'number', description: 'Market capitalization' },
      volume24h: { type: 'number', description: '24-hour trading volume' },
      change24h: { type: 'number', description: '24-hour price change' },
      high24h: { type: 'number', description: '24-hour high price' },
      low24h: { type: 'number', description: '24-hour low price' },
      exchange: { type: 'string', description: 'Stock exchange (for stocks)' },
      mic_code: {
        type: 'string',
        description: 'Market identifier code (for stocks)',
      },
      sector: { type: 'string', description: 'Business sector (for stocks)' },
      industry: {
        type: 'string',
        description: 'Industry classification (for stocks)',
      },
      employees: {
        type: 'number',
        description: 'Number of employees (for stocks)',
      },
      website: { type: 'string', description: 'Company website (for stocks)' },
      type: { type: 'string', description: 'Asset sub-type' },
      CEO: { type: 'string', description: 'CEO name (for stocks)' },
      address: { type: 'string', description: 'Company address (for stocks)' },
      address2: {
        type: 'string',
        description: 'Company address line 2 (for stocks)',
      },
      city: { type: 'string', description: 'Company city (for stocks)' },
      zip: { type: 'string', description: 'Company zip code (for stocks)' },
      state: { type: 'string', description: 'Company state (for stocks)' },
      country: { type: 'string', description: 'Company country (for stocks)' },
      phone: {
        type: 'string',
        description: 'Company phone number (for stocks)',
      },
    },
    required: [
      'pk',
      'sk',
      'EntityType',
      'AssetType',
      'Symbol',
      'name',
      'currentPrice',
      'lastUpdated',
    ],
  },
} as const;
