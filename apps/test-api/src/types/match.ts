export interface PlayerAsset {
  ticker: string;
  selectedAt: string;
}

export interface PlayerAssetSelection {
  assets: PlayerAsset[];
  readyAt?: string;
}

export interface PlayerAssetSelections {
  [userId: string]: PlayerAssetSelection;
}

export interface PortfolioAsset {
  ticker: string;
  initialPrice: number;
  currentPrice?: number;
  shares: number; // Number of shares owned of this asset based on 33% of initial portfolio value
  percentageChange?: number;
  lastUpdatedAt?: string;
}

export interface PlayerPortfolio {
  initialValue: number;
  currentValue?: number;
  assets: PortfolioAsset[];
}

export interface MatchPortfolios {
  [userId: string]: PlayerPortfolio;
}
