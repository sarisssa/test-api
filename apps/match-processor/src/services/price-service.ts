import { TickerPriceMap } from '../types'

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY

export const fetchCurrentPrices = async (tickers: string[]): Promise<TickerPriceMap> => {
  if (tickers.length === 0) {
    console.log('No tickers found, skipping price fetch.')
    return {}
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

    const priceData: TickerPriceMap = await apiPriceResponse.json()
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
