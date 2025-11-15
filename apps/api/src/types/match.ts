export enum PerkType {
  ICE = 'ICE', // Freezes price action for one asset
  FLAME = 'FLAME', // Removes the effect of ICE
  JUICED = 'JUICED', // Provides 2x leverage for one asset
  WIPE = 'WIPE', // Removes ALL active perks in play
  SHADOW = 'SHADOW', // Hides asset info from the opponent
  SABOTAGE = 'SABOTAGE', // Reverses P&L calculation (turns into short)
  GUARD = 'GUARD', // Prevents other single-target perks from being applied.
  ASSASSIN = 'ASSASSIN', // Removes an asset from the opponent's portfolio.
  FORTRESS = 'FORTRESS', // Prevents any perk effects for 1/5 of the total match duration.
  THIEF = 'THIEF', // Decrements opponent's portfolio performance by 1% and adds it to self.
}

export interface DeployedPerk {
  perkType: PerkType;
  deployedAt: string;
  targetPlayerId: string;
  targetTicker?: string;
}

export enum AssetType {
  STOCK = 'STOCK',
  CRYPTO = 'CRYPTO',
  COMMODITY = 'COMMODITY',
}

// --- PERK TYPE DISCRIMINATED UNIONS ---

type PlayerAssetGuarded =
  | {
      isGuarded: true;
      guardedAt: string;
    }
  | {
      isGuarded: false;
      guardedAt?: never;
    };

type PlayerAssetFrozen =
  | {
      isPriceFrozen: true;
      frozenAtPrice: number;
      frozenByPlayerId: string;
      frozenAt: string;
    }
  | {
      isPriceFrozen: false;
      frozenAtPrice?: never;
      frozenByPlayerId?: never;
      frozenAt?: never;
    };

type PlayerAssetJuiced =
  | {
      leverageMultiplier: 2;
      juicedByPlayerId: string;
      juicedAt: string;
    }
  | {
      leverageMultiplier: 1;
      juicedByPlayerId?: never;
      juicedAt?: never;
    };

type PlayerAssetShadowed =
  | {
      isShadowed: true;
      shadowedByPlayerId: string;
    }
  | {
      isShadowed: false;
      shadowedByPlayerId?: never;
    };

type PlayerAssetFlipped =
  | {
      isFlipped: true;
      flippedAtPrice: number;
      sabotagedByPlayerId: string;
    }
  | {
      isFlipped: false;
      flippedAtPrice?: never;
      sabotagedByPlayerId?: never;
    };

type PlayerAssetAssassinated =
  | {
      isAssassinated: true;
      assassinatedByPlayerId: string;
      assassinatedAt: string;
    }
  | {
      isAssassinated: false;
      assassinatedByPlayerId?: never;
      assassinatedAt?: never;
    };

export type PlayerAsset = {
  ticker: string;
  name: string;
  selectedAt: string;
  assetType: AssetType;
  initialPrice: number;
  shares: number;
  endPrice?: number;
  currentPrice?: number;
  lastUpdatedAt?: string;
} & PlayerAssetGuarded &
  PlayerAssetFrozen &
  PlayerAssetJuiced &
  PlayerAssetShadowed &
  PlayerAssetFlipped &
  PlayerAssetAssassinated;

export interface PlayerAssetSelection {
  assets: PlayerAsset[];
  deployedPerks: DeployedPerk[]; //FE will have fire emoji count
  readyAt?: string;
  performanceModifierPercent: number; // Start at 0, increment or decrement if apply Thief or target of Thief
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
