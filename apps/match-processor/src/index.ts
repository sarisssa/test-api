import { getActiveMatches, saveUpdatedMatches } from './services/dynamo-service.js'
import { fetchCurrentPrices } from './services/price-service.js'
import { scheduleNextExecution } from './services/sqs-service.js'
import {
  getActiveTickersForCurrentMarket,
  processMatchCompletions,
  updateMatchPortfolios
} from './utils/match-processor.js'

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

    const activeTickersArray = getActiveTickersForCurrentMarket(matches)

    if (activeTickersArray.length === 0) {
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

    const priceData = await fetchCurrentPrices(activeTickersArray)

    const updatedMatches = updateMatchPortfolios(matches, priceData)

    const completedMatches = processMatchCompletions(updatedMatches)

    // Filter out completed matches from updatedMatches to avoid duplicates
    const ongoingMatches = updatedMatches.filter((match) => {
      const hasEnded =
        match.matchTentativeEndTime && new Date(match.matchTentativeEndTime) <= new Date()
      return !hasEnded
    })

    // Save only ongoing matches (still in_progress) and completed matches
    await saveUpdatedMatches([...ongoingMatches, ...completedMatches])

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Lambda executed successfully with price updates',
        matchesProcessed: matches.length,
        matchesUpdated: updatedMatches.length,
        matchesCompleted: completedMatches.length,
        tickersProcessed: activeTickersArray.length,
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
