import { Match, TickerPriceMap } from '../types'

export const getAllUniqueTickers = (matches: Match[]): string[] => {
  const allTickers = new Set<string>()

  for (const match of matches) {
    Object.values(match.playerAssets || {}).forEach((playerAssetEntry) => {
      playerAssetEntry?.assets?.forEach((asset) => {
        if (asset.ticker) {
          allTickers.add(asset.ticker)
        }
      })
    })
  }
  return Array.from(allTickers)
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
