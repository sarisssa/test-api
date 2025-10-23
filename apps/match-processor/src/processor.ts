import {
  batchUpdateAssetPrices,
  getActiveMatches,
  recordPriceRunMetrics,
  updateMatchPlayerAssetPrices
} from './services/dynamo-service.js'
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
    try {
      await recordPriceRunMetrics({
        fetchedAt: new Date().toISOString(),
        matchesProcessed: 0,
        tickersProcessed: 0,
        cacheHitCount: 0,
        cacheMissCount: 0,
        fallbackCount: 0,
        staleSymbols: [],
        errors: []
      })
    } catch (metricsError) {
      console.warn('Failed to record price metrics for empty iteration:', metricsError)
    }
    return { matchesProcessed: 0, tickersProcessed: 0 }
  }

  const activeTickersWithTypes = getActiveTickersWithTypesForCurrentMarket(matches)

  if (activeTickersWithTypes.length === 0) {
    console.log('No active tickers for current market hours - skipping price fetch.')
    return { matchesProcessed: matches.length, tickersProcessed: 0 }
  }

  const assetsForPricing = activeTickersWithTypes.map(({ ticker, assetType }) => ({
    symbol: ticker,
    assetType
  }))
  const priceSummary = await fetchCurrentPrices(assetsForPricing)
  const priceData = priceSummary.prices

  if (priceSummary.errors.length > 0) {
    console.warn(
      'Encountered errors during price fetch:',
      JSON.stringify(priceSummary.errors, null, 2)
    )
  }

  if (priceSummary.staleSymbols.length > 0) {
    console.warn(
      'Stale price data detected for symbols:',
      JSON.stringify(priceSummary.staleSymbols)
    )
  }

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

  const priceLookup = new Map<string, number>()
  priceUpdates.forEach(update => {
    if (!Number.isNaN(update.currentPrice)) {
      priceLookup.set(update.symbol, update.currentPrice)
    }
  })

  const matchUpdatePromises = matches
    .map(match => {
      const selections = match.playerAssets ?? {}
      let touched = false
      const updatedSelections: typeof selections = {}

      for (const [userId, selection] of Object.entries(selections)) {
        const updatedAssets = selection.assets.map(asset => {
          const updatedPrice = priceLookup.get(asset.ticker)
          if (updatedPrice === undefined) {
            return asset
          }
          touched = true
          return {
            ...asset,
            currentPrice: updatedPrice,
            lastUpdatedAt: priceSummary.fetchedAt
          }
        })

        updatedSelections[userId] = {
          ...selection,
          assets: updatedAssets
        }
      }

      if (!touched) {
        return null
      }

      match.playerAssets = updatedSelections
      return updateMatchPlayerAssetPrices(match.matchId, updatedSelections)
    })
    .filter((promise): promise is Promise<void> => Boolean(promise))

  if (matchUpdatePromises.length > 0) {
    await Promise.all(matchUpdatePromises)
  }

  try {
    await recordPriceRunMetrics({
      fetchedAt: priceSummary.fetchedAt,
      matchesProcessed: matches.length,
      tickersProcessed: priceUpdates.length,
      cacheHitCount: priceSummary.cacheHits.length,
      cacheMissCount: priceSummary.apiBatchSymbols.length,
      fallbackCount: priceSummary.apiFallbackSymbols.length,
      staleSymbols: priceSummary.staleSymbols,
      errors: priceSummary.errors.map(error => ({
        symbol: error.symbol,
        message: error.message,
        source: error.source
      }))
    })
  } catch (metricsError) {
    console.warn('Failed to record price metrics:', metricsError)
  }

  return {
    matchesProcessed: matches.length,
    tickersProcessed: priceUpdates.length
  }
}
