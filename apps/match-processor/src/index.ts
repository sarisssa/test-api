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

    const priceProcessingResult = activeTickersWithTypes.reduce(
      (
        acc,
        { ticker, assetType }
      ) => {
        const tickerData = priceData[ticker]

        if (!tickerData || typeof tickerData.price !== 'string') {
          acc.skipped.push(ticker)
          return acc
        }

        const parsedPrice = Number.parseFloat(tickerData.price)
        if (Number.isNaN(parsedPrice)) {
          console.warn(`Price for ${ticker} could not be parsed as a number, skipping.`)
          acc.skipped.push(ticker)
          return acc
        }

        acc.updates.push({
          assetType,
          symbol: ticker,
          currentPrice: parsedPrice
        })

        return acc
      },
      {
        updates: [] as Array<{
          assetType: 'STOCK' | 'CRYPTO' | 'COMMODITY'
          symbol: string
          currentPrice: number
        }>,
        skipped: [] as string[]
      }
    )

    if (priceProcessingResult.skipped.length > 0) {
      console.warn(
        `Skipping ${priceProcessingResult.skipped.length} tickers with missing or invalid price data: ${priceProcessingResult.skipped.join(
          ', '
        )}`
      )
    }

    if (priceProcessingResult.updates.length === 0) {
      console.warn('No valid price updates found after validation - skipping DynamoDB update.')
    } else {
      await batchUpdateAssetPrices(priceProcessingResult.updates)
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Lambda executed successfully with price updates',
        matchesProcessed: matches.length,
        tickersProcessed: priceProcessingResult.updates.length,
        tickersSkipped: priceProcessingResult.skipped.length,
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
