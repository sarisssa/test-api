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
}

export interface PlayerAssetSelection {
  assets: PlayerAsset[];
  readyAt?: string;
}

export interface PlayerAssetSelections {
  [userId: string]: PlayerAssetSelection;
}
