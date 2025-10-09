import { sleep } from 'wage-shared'
import { processMatchesOnce } from './processor.js'

const DEFAULT_INTERVAL_SECONDS = 30

const resolveInterval = () => {
  const raw = process.env.MATCH_PROCESSOR_INTERVAL_SECONDS
  if (!raw) {
    return DEFAULT_INTERVAL_SECONDS
  }

  const parsed = Number(raw)
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.warn(
      `MATCH_PROCESSOR_INTERVAL_SECONDS is invalid (${raw}), falling back to ${DEFAULT_INTERVAL_SECONDS} seconds.`
    )
    return DEFAULT_INTERVAL_SECONDS
  }

  return parsed
}

export const startMatchProcessorLoop = async () => {
  const intervalSeconds = resolveInterval()
  console.log(`Match processor loop starting. Interval: ${intervalSeconds}s`)

  while (true) {
    try {
      const result = await processMatchesOnce()
      console.log(
        `Match processor iteration complete: ${result.matchesProcessed} matches, ${result.tickersProcessed} tickers.`
      )
    } catch (error) {
      console.error('Match processor iteration failed:', error)
    }

    await sleep(intervalSeconds * 1000)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMatchProcessorLoop().catch(error => {
    console.error('Fatal error in match processor loop:', error)
    process.exit(1)
  })
}
