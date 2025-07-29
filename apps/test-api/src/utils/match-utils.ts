import { INITIAL_PORTFOLIO_VALUE, REQUIRED_ASSET_COUNT } from '../constants.js';
import { DynamoDBMatchItem } from '../models/match.js';
import {
  MatchPortfolios,
  PlayerAsset,
  PortfolioAsset,
} from '../types/match.js';

interface PriceData {
  [ticker: string]: {
    price: string;
  };
}

export const collectUniqueTickers = (playerAssets: {
  [userId: string]: { assets: PlayerAsset[] };
}): string[] => {
  const uniqueTickers = new Set<string>();
  Object.values(playerAssets).forEach(playerAssetsEntry => {
    playerAssetsEntry.assets.forEach(asset => {
      uniqueTickers.add(asset.ticker);
    });
  });
  return Array.from(uniqueTickers);
};

export const calculateAssetShares = (initialPrice: number): number => {
  return INITIAL_PORTFOLIO_VALUE / REQUIRED_ASSET_COUNT / initialPrice;
};

export const processAssetWithPrice = (
  asset: PlayerAsset,
  priceData: PriceData,
  timestamp: string
): PortfolioAsset => {
  if (!priceData[asset.ticker]?.price) {
    throw new Error(`Missing price data for ticker: ${asset.ticker}`);
  }

  const initialPrice = parseFloat(priceData[asset.ticker].price);
  const shares = calculateAssetShares(initialPrice);

  return {
    ticker: asset.ticker,
    assetType: asset.assetType,
    initialPrice,
    currentPrice: initialPrice,
    shares,
    lastUpdatedAt: timestamp,
  };
};

export const initializePlayerPortfolios = (
  match: DynamoDBMatchItem,
  priceData: PriceData,
  timestamp: string
): MatchPortfolios => {
  const portfolios: MatchPortfolios = {};

  for (const playerId of match.players) {
    const playerInitialAssets = match.playerAssets[playerId].assets;
    const processedAssets = playerInitialAssets.map(asset =>
      processAssetWithPrice(asset, priceData, timestamp)
    );

    portfolios[playerId] = {
      initialValue: INITIAL_PORTFOLIO_VALUE,
      currentValue: INITIAL_PORTFOLIO_VALUE,
      assets: processedAssets,
    };
  }

  return portfolios;
};
