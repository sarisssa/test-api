import { INITIAL_PORTFOLIO_VALUE, REQUIRED_ASSET_COUNT } from '../constants.js';
import { AssetPriceData, PlayerAsset } from '../types/match.js';

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
  assetPriceData: AssetPriceData,
  timestamp: string
) => {
  if (!assetPriceData[asset.ticker]?.price) {
    throw new Error(`Missing price data for ticker: ${asset.ticker}`);
  }

  const initialPrice = parseFloat(assetPriceData[asset.ticker].price);
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
