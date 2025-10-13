import { TickerPriceMap } from '../types.js'

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY
const USE_PRICE_SERVICE_STUB =
  (process.env.USE_PRICE_SERVICE_STUB ?? 'false').toLowerCase() === 'true'

const shouldUseStub = () => {
  if (USE_PRICE_SERVICE_STUB) {
    return true
  }
  if (!TWELVE_DATA_API_KEY || TWELVE_DATA_API_KEY === 'dummy') {
    return true
  }
  return false
}

const buildStubPrice = (symbol: string): string => {
  const hash = symbol
    .toUpperCase()
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0)

  const dollars = 20 + (hash % 200)
  const cents = hash % 100

  return `${dollars}.${cents.toString().padStart(2, '0')}`
}

export const fetchCurrentPrices = async (tickers: string[]): Promise<TickerPriceMap> => {
  if (tickers.length === 0) {
    console.log('No tickers found, skipping price fetch.')
    return {}
  }

  if (shouldUseStub()) {
    console.log('Returning stubbed price data (local testing mode).')
    return tickers.reduce<TickerPriceMap>((acc, ticker) => {
      const price = buildStubPrice(ticker)
      acc[ticker] = { price }
      console.log(`${ticker}: $${price} (stub)`)
      return acc
    }, {})
  }

  const symbolsString = tickers.join(',')
  const apiUrl = `https://api.twelvedata.com/price?symbol=${symbolsString}&apikey=${TWELVE_DATA_API_KEY}`

  console.log('Calling Twelve Data API...')

  try {
    const apiPriceResponse = await fetch(apiUrl)

    if (!apiPriceResponse.ok) {
      throw new Error(
        `HTTP error! status: ${apiPriceResponse.status} - ${await apiPriceResponse.text()}`
      )
    }

    const priceData: TickerPriceMap = (await apiPriceResponse.json()) as TickerPriceMap
    console.log('Price data received:', JSON.stringify(priceData, null, 2))

    Object.entries(priceData).forEach(([ticker, data]) => {
      if (data && typeof data.price === 'string') {
        console.log(`${ticker}: $${data.price}`)
      } else {
        console.warn(`Price data for ${ticker} is malformed:`, data)
      }
    })

    return priceData
  } catch (apiError) {
    console.error('Error fetching price data:', apiError)
    return {}
  }
}
