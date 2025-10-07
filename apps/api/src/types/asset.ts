import { AssetType } from './match.js';

export interface GetAssetParams {
  symbol: string;
}

export interface GetAssetQuery {
  interval?: string;
  from?: string;
  to?: string;
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
      pattern: '^[A-Z.]+$',
      minLength: 1,
      maxLength: 10,
    },
  },
  required: ['symbol'],
  additionalProperties: false,
} as const;

export const getAssetQueryJsonSchema = {
  type: 'object',
  properties: {
    interval: {
      type: 'string',
      enum: ['1min', '5min', '15min', '30min', '1h', '4h', '1day'],
    },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
  },
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
