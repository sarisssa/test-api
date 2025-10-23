import { processMatchesOnce } from './processor.js'

export const handler = async () => {
  try {
    const result = await processMatchesOnce()
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Match processor iteration complete',
        ...result,
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    console.error('Error running match processor iteration:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error running match processor iteration',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}

export { processMatchesOnce } from './processor.js'
