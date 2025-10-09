import { batchUpdateAssetPrices, getActiveMatches } from './services/dynamo-service.js'
import { fetchCurrentPrices } from './services/price-service.js'
import { getActiveTickersWithTypesForCurrentMarket } from './utils/match-processor.js'

export type ProcessorResult = {
  matchesProcessed: number
  tickersProcessed: number
}

export const processMatchesOnce = async (): Promise<ProcessorResult> => {
  const matches = await getActiveMatches()

  if (matches.length === 0) {
    console.log('No active matches found to process in this iteration.')
    return { matchesProcessed: 0, tickersProcessed: 0 }
  }

  const activeTickersWithTypes = getActiveTickersWithTypesForCurrentMarket(matches)

  if (activeTickersWithTypes.length === 0) {
    console.log('No active tickers for current market hours - skipping price fetch.')
    return { matchesProcessed: matches.length, tickersProcessed: 0 }
  }

  const activeTickers = activeTickersWithTypes.map(({ ticker }) => ticker)
  const priceData = await fetchCurrentPrices(activeTickers)

  const priceUpdates = activeTickersWithTypes
    .map(({ ticker, assetType }) => {
      const update = priceData[ticker]
      if (!update || typeof update.price !== 'string') {
        console.warn(`Skipping ticker ${ticker} due to missing price data`)
        return null
      }
      return {
        assetType,
        symbol: ticker,
        currentPrice: parseFloat(update.price)
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  await batchUpdateAssetPrices(priceUpdates)

  return {
    matchesProcessed: matches.length,
    tickersProcessed: priceUpdates.length
  }
}
