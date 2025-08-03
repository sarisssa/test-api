import { AssetType, Match } from '../types.js'
import { filterTickersByMarketHours } from './market-hours.js'

export const getAllUniqueTickersWithTypes = (
  matches: Match[]
): Array<{ ticker: string; assetType: AssetType }> => {
  const tickerMap = new Map<string, AssetType>()

  for (const match of matches) {
    Object.values(match.playerAssets || {}).forEach((playerAssetEntry) => {
      playerAssetEntry?.assets?.forEach((asset) => {
        if (asset.ticker && asset.assetType) {
          tickerMap.set(asset.ticker, asset.assetType)
        }
      })
    })
  }

  return Array.from(tickerMap.entries()).map(([ticker, assetType]) => ({
    ticker,
    assetType
  }))
}

export const getActiveTickersForCurrentMarket = (matches: Match[]): string[] => {
  const tickersWithTypes = getAllUniqueTickersWithTypes(matches)
  return filterTickersByMarketHours(tickersWithTypes)
}

export const getActiveTickersWithTypesForCurrentMarket = (
  matches: Match[]
): Array<{ ticker: string; assetType: AssetType }> => {
  const tickersWithTypes = getAllUniqueTickersWithTypes(matches)
  const activeTickers = filterTickersByMarketHours(tickersWithTypes)
  return tickersWithTypes.filter(({ ticker }) => activeTickers.includes(ticker))
}
