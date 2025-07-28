import { AssetType, Match, TickerPriceMap } from '../types'
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

export const updateMatchPortfolios = (matches: Match[], priceData: TickerPriceMap): Match[] => {
  const updatedMatches: Match[] = []
  const currentTimestamp = new Date().toISOString()

  for (const match of matches) {
    let matchUpdated = false
    const updatedMatch: Match = { ...match }

    if (updatedMatch.portfolios && Object.keys(priceData).length > 0) {
      console.log(`=== UPDATING MATCH ${updatedMatch.matchId} ===`)

      Object.keys(updatedMatch.portfolios).forEach((playerId) => {
        const portfolio = updatedMatch.portfolios[playerId]

        if (portfolio && portfolio.assets) {
          let newPortfolioValue = 0

          portfolio.assets.forEach((asset, index) => {
            // Ensure priceData has the ticker and it's a valid string price
            if (priceData[asset.ticker] && typeof priceData[asset.ticker].price === 'string') {
              const newPrice = parseFloat(priceData[asset.ticker].price)
              const oldPrice = asset.currentPrice

              if (!isNaN(newPrice)) {
                asset.currentPrice = newPrice
                asset.lastUpdatedAt = currentTimestamp
                matchUpdated = true

                console.log(
                  `Updated ${asset.ticker} for player ${playerId}: $${oldPrice} → $${newPrice}`
                )
              } else {
                console.warn(
                  `Invalid price received for ${asset.ticker}: ${priceData[asset.ticker].price}`
                )
              }
            } else {
              console.warn(
                `No valid price data for ticker ${asset.ticker} in match ${updatedMatch.matchId}.`
              )
            }

            newPortfolioValue += asset.shares * asset.currentPrice
          })

          const oldValue = portfolio.currentValue
          portfolio.currentValue = Math.round(newPortfolioValue * 100) / 100

          console.log(
            `Portfolio value for player ${playerId}: $${oldValue} → $${portfolio.currentValue}`
          )
        }
      })
    }

    if (matchUpdated) {
      updatedMatches.push(updatedMatch)
    }
  }
  return updatedMatches
}
export const processMatchCompletions = (matches: Match[]): Match[] => {
  const completedMatches: Match[] = []
  const now = new Date()

  for (const match of matches) {
    if (match.matchEndedAt && new Date(match.matchEndedAt) <= now) {
      const completedMatch = { ...match }

      // Determine winner based on portfolio values
      const playerIds = Object.keys(completedMatch.portfolios || {})
      const winner = playerIds.reduce((prev, current) =>
        (completedMatch.portfolios[current]?.currentValue || 0) >
        (completedMatch.portfolios[prev]?.currentValue || 0)
          ? current
          : prev
      )

      completedMatch.winnerId = winner
      completedMatch.status = 'completed'

      console.log({
        msg: 'Match completed!'
      })
      completedMatches.push(completedMatch)
    }
  }

  return completedMatches
}
