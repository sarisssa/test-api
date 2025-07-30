import { batchUpdateAssetPrices, getActiveMatches } from './services/dynamo-service.js'
import { fetchCurrentPrices } from './services/price-service.js'
import { scheduleNextExecution } from './services/sqs-service.js'
import { getActiveTickersWithTypesForCurrentMarket } from './utils/match-processor.js'

export const handler = async () => {
  try {
    const matches = await getActiveMatches()

    if (matches.length === 0) {
      console.log('No active matches found to process in this invocation.')
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No active matches found, scheduled next execution',
          matchesProcessed: 0,
          matchesUpdated: 0,
          tickersProcessed: 0,
          timestamp: new Date().toISOString(),
          nextExecutionScheduled: true
        })
      }
    }

    const activeTickersWithTypes = getActiveTickersWithTypesForCurrentMarket(matches)

    if (activeTickersWithTypes.length === 0) {
      console.log('No active tickers for current market hours - skipping price fetch.')
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No active tickers for current market hours',
          matchesProcessed: matches.length,
          matchesUpdated: 0,
          tickersProcessed: 0,
          timestamp: new Date().toISOString(),
          nextExecutionScheduled: true
        })
      }
    }

    const activeTickersArray = activeTickersWithTypes.map(({ ticker }) => ticker)
    const priceData = await fetchCurrentPrices(activeTickersArray)

    const priceUpdates = activeTickersWithTypes.map(({ ticker, assetType }) => ({
      assetType,
      symbol: ticker,
      currentPrice: parseFloat(priceData[ticker].price)
    }))

    await batchUpdateAssetPrices(priceUpdates)

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Lambda executed successfully with price updates',
        matchesProcessed: matches.length,
        tickersProcessed: activeTickersWithTypes.length,
        timestamp: new Date().toISOString(),
        nextExecutionScheduled: true
      })
    }
  } catch (error) {
    console.error('Error in lambda execution:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error in lambda execution',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  } finally {
    try {
      await scheduleNextExecution()
    } catch (schedulingError) {
      console.error('Failed to schedule next execution:', schedulingError)
    }
  }
}
