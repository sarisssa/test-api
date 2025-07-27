import { getActiveMatches, saveUpdatedMatches } from './services/dynamo-service.js'
import { fetchCurrentPrices } from './services/price-service.js'
import { scheduleNextExecution } from './services/sqs-service.js'
import { getAllUniqueTickers, updateMatchPortfolios } from './utils/match-processor.js'

export const handler = async () => {
  try {
    const matches = await getActiveMatches()

    if (matches.length === 0) {
      console.log('No active matches found to process in this invocation.')
      await scheduleNextExecution()
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

    const uniqueTickersArray = getAllUniqueTickers(matches)

    const priceData = await fetchCurrentPrices(uniqueTickersArray)

    const updatedMatches = updateMatchPortfolios(matches, priceData)

    await saveUpdatedMatches(updatedMatches)

    await scheduleNextExecution()

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Lambda executed successfully with price updates',
        matchesProcessed: matches.length,
        matchesUpdated: updatedMatches.length,
        tickersProcessed: uniqueTickersArray.length,
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
  }
}
