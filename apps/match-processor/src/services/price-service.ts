import { TickerPriceMap } from '../types.js'

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY

type TwelveDataErrorEnvelope = {
  status?: string
  code?: number | string
  message?: string
}

type TwelveDataTickerSuccess = { price: string }
type TwelveDataTickerError = { status?: string; code?: number | string; message?: string }

const isErrorEnvelope = (payload: unknown): payload is TwelveDataErrorEnvelope => {
  return (
    !!payload &&
    typeof payload === 'object' &&
    ('code' in payload ||
      ('status' in payload &&
        typeof (payload as Record<string, unknown>).status === 'string' &&
        (payload as Record<string, unknown>).status === 'error'))
  )
}

const isTickerSuccess = (payload: unknown): payload is TwelveDataTickerSuccess => {
  return (
    !!payload &&
    typeof payload === 'object' &&
    typeof (payload as Record<string, unknown>).price === 'string'
  )
}

const isTickerError = (payload: unknown): payload is TwelveDataTickerError => {
  return (
    !!payload &&
    typeof payload === 'object' &&
    (payload as Record<string, unknown>).status === 'error'
  )
}

export const fetchCurrentPrices = async (tickers: string[]): Promise<TickerPriceMap> => {
  if (tickers.length === 0) {
    console.log('No tickers found, skipping price fetch.')
    return {}
  }

  if (!TWELVE_DATA_API_KEY) {
    throw new Error('TWELVE_DATA_API_KEY is not configured')
  }

  const symbolsString = tickers.join(',')
  const apiUrl = `https://api.twelvedata.com/price?symbol=${symbolsString}&apikey=${TWELVE_DATA_API_KEY}`

  console.log('Calling Twelve Data API...')

  try {
    const apiPriceResponse = await fetch(apiUrl)
    const rawBody = await apiPriceResponse.text()

    if (!apiPriceResponse.ok) {
      throw new Error(
        `HTTP error! status: ${apiPriceResponse.status} - ${rawBody || apiPriceResponse.statusText}`
      )
    }

    let parsedBody: unknown = {}
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : {}
    } catch (parseError) {
      throw new Error(
        `Failed to parse Twelve Data response: ${(parseError as Error).message || 'Unknown error'}`
      )
    }

    if (isErrorEnvelope(parsedBody)) {
      throw new Error(
        `Twelve Data error${parsedBody.code ? ` (${parsedBody.code})` : ''}: ${parsedBody.message ?? 'Unknown error'
        }`
      )
    }

    const priceData: TickerPriceMap = {}
    const missingTickers: string[] = []
    const erroredTickers: Array<{ ticker: string; message?: string }> = []

    tickers.forEach((ticker) => {
      const tickerData = (parsedBody as Record<string, unknown>)[ticker]

      if (isTickerSuccess(tickerData)) {
        priceData[ticker] = { price: tickerData.price }
        return
      }

      if (isTickerError(tickerData)) {
        erroredTickers.push({ ticker, message: tickerData.message })
      } else {
        missingTickers.push(ticker)
      }
    })

    if (missingTickers.length > 0) {
      console.warn(
        `Price data missing for tickers: ${missingTickers.join(', ')} - they will be skipped.`
      )
    }

    if (erroredTickers.length > 0) {
      erroredTickers.forEach(({ ticker, message }) => {
        console.warn(
          `Twelve Data returned an error for ${ticker}: ${message ?? 'no message provided'}`
        )
      })
    }

    console.log('Price data received:', JSON.stringify(priceData, null, 2))
    return priceData
  } catch (apiError) {
    console.error('Error fetching price data:', apiError)
    return {}
  }
}
