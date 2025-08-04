export enum AssetType {
  STOCK = 'STOCK',
  CRYPTO = 'CRYPTO',
  COMMODITY = 'COMMODITY',
}

export interface PlayerAsset {
  ticker: string;
  selectedAt: string;
  assetType: AssetType;
  initialPrice: number;
  shares: number;
  endPrice?: number;
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
