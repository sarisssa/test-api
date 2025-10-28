export enum AssetType {
  STOCK = 'STOCK',
  CRYPTO = 'CRYPTO',
  COMMODITY = 'COMMODITY',
}

export interface PlayerAsset {
  ticker: string;
  name: string;
  selectedAt: string;
  assetType: AssetType;
  initialPrice: number;
  shares: number;
  endPrice?: number;
  currentPrice?: number;
  lastUpdatedAt?: string;
}

export interface PlayerAssetSelection {
  assets: PlayerAsset[];
  readyAt?: string;
}

export interface PlayerAssetSelections {
  [userId: string]: PlayerAssetSelection;
}

export interface AssetPriceData {
  [ticker: string]: {
    price: string;
  };
}

export const matchDetailsSchema = {
  params: {
    type: 'object',
    properties: {
      matchId: {
        type: 'string',
        description: 'Match ID',
      },
    },
    required: ['matchId'],
  },
  response: {
    200: {
      description: 'Match details',
      type: 'object',
      properties: {
        matchId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['asset_selection', 'in_progress', 'completed', 'cancelled'],
        },
        matchEndTime: { type: 'string', nullable: true },
        players: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              assets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    ticker: { type: 'string' },
                    name: { type: 'string' },
                    assetType: {
                      type: 'string',
                      enum: ['STOCK', 'CRYPTO', 'COMMODITY'],
                    },
                    initialPrice: { type: 'number' },
                    currentPrice: { type: 'number', nullable: true },
                    shares: { type: 'number' },
                    lastUpdatedAt: { type: 'string', nullable: true },
                  },
                  required: ['ticker', 'assetType', 'initialPrice', 'shares'],
                },
              },
            },
            required: ['userId', 'assets'],
          },
        },
      },
      required: ['matchId', 'status', 'players'],
    },
    404: {
      description: 'Match not found',
      $ref: 'ErrorResponse#',
    },
    403: {
      description: 'Access denied',
      $ref: 'ErrorResponse#',
    },
    500: {
      description: 'Internal server error',
      $ref: 'ErrorResponse#',
    },
  },
} as const;
