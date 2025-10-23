import { TickerPriceMap } from '../types.js'
import {
  getPriceCacheClient,
  isCacheEntryFresh,
  isCacheEntryStale,
  type AssetDescriptor,
  type PriceCacheEntry
} from './price-cache.js'

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY
const USE_PRICE_SERVICE_STUB =
  (process.env.USE_PRICE_SERVICE_STUB ?? 'false').toLowerCase() === 'true'
const THROTTLE_INTERVAL_MS = Number.parseInt(
  process.env.PRICE_REQUEST_MIN_INTERVAL_MS ?? '0',
  10
)

type LogLevel = 'info' | 'warn' | 'error'

export interface PriceFetchError {
  symbol: string
  source: 'cache' | 'batch' | 'fallback'
  message: string
  details?: unknown
}

export interface PriceFetchSummary {
  prices: TickerPriceMap
  fetchedAt: string
  cacheHits: string[]
  apiBatchSymbols: string[]
  apiFallbackSymbols: string[]
  staleSymbols: string[]
  errors: PriceFetchError[]
  throttleDelayMs: number
}

let lastRequestTime = 0

const isPlaceholderKey = (value: string | undefined): boolean => {
  if (!value) {
    return true
  }
  const normalised = value.trim().toLowerCase()
  return (
    normalised === '' ||
    normalised === 'dummy' ||
    normalised === 'replace-with-real-key'
  )
}

const shouldUseStub = (): boolean => {
  if (USE_PRICE_SERVICE_STUB) {
    log('warn', 'Price service stub enabled explicitly via USE_PRICE_SERVICE_STUB=true')
    return true
  }

  if (isPlaceholderKey(TWELVE_DATA_API_KEY)) {
    const msg = 'TWELVE_DATA_API_KEY missing or placeholder; using stubbed pricing'
    if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
      throw new Error(`${msg} in production environment`)
    }
    log('warn', msg)
    return true
  }

  return false
}

const log = (level: LogLevel, message: string, meta: Record<string, unknown> = {}) => {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta
  }

  if (level === 'error') {
    console.error(JSON.stringify(payload))
  } else if (level === 'warn') {
    console.warn(JSON.stringify(payload))
  } else {
    console.log(JSON.stringify(payload))
  }
}

const enforceThrottle = async (): Promise<number> => {
  if (THROTTLE_INTERVAL_MS <= 0) {
    lastRequestTime = Date.now()
    return 0
  }

  const now = Date.now()
  const elapsed = now - lastRequestTime

  if (elapsed >= THROTTLE_INTERVAL_MS) {
    lastRequestTime = now
    return 0
  }

  const waitMs = THROTTLE_INTERVAL_MS - elapsed
  await new Promise(resolve => setTimeout(resolve, waitMs))
  lastRequestTime = Date.now()
  return waitMs
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

const normaliseAssets = (assets: AssetDescriptor[]): AssetDescriptor[] => {
  const seen = new Set<string>()
  return assets.filter(asset => {
    const key = asset.symbol.toUpperCase()
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

const parsePriceValue = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  if ('price' in value && typeof (value as { price: unknown }).price === 'string') {
    return (value as { price: string }).price
  }
  if ('price' in value && typeof (value as { price: unknown }).price === 'number') {
    return (value as { price: number }).price.toString()
  }
  return null
}

const isErrorPayload = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return true
  }
  return 'status' in value && (value as { status: string }).status === 'error'
}

const fetchBatchFromApi = async (
  symbols: string[]
): Promise<{ data: Record<string, string>; errors: PriceFetchError[]; throttleDelayMs: number }> => {
  const summaryErrors: PriceFetchError[] = []

  if (symbols.length === 0) {
    return { data: {}, errors: summaryErrors, throttleDelayMs: 0 }
  }

  const symbolsString = symbols.join(',')
  const apiUrl = `https://api.twelvedata.com/price?symbol=${symbolsString}&apikey=${TWELVE_DATA_API_KEY}`

  const throttleDelayMs = await enforceThrottle()

  try {
    const response = await fetch(apiUrl)
    if (!response.ok) {
      const bodyText = await response.text()
      throw new Error(`HTTP ${response.status}: ${bodyText}`)
    }

    const payload = (await response.json()) as Record<string, unknown>
    const batchData: Record<string, string> = {}

    for (const symbol of symbols) {
      const entry = payload?.[symbol]
      if (entry === undefined) {
        summaryErrors.push({
          symbol,
          source: 'batch',
          message: 'Symbol missing from TwelveData batch response'
        })
        continue
      }

      if (isErrorPayload(entry)) {
        summaryErrors.push({
          symbol,
          source: 'batch',
          message: 'TwelveData reported error',
          details: entry
        })
        continue
      }

      const price = parsePriceValue(entry)
      if (!price) {
        summaryErrors.push({
          symbol,
          source: 'batch',
          message: 'Invalid price payload',
          details: entry
        })
        continue
      }

      batchData[symbol] = price
    }

    log('info', 'TwelveData batch fetch completed', {
      symbols,
      throttleDelayMs,
      successCount: Object.keys(batchData).length,
      errorCount: summaryErrors.length
    })

    return { data: batchData, errors: summaryErrors, throttleDelayMs }
  } catch (error) {
    log('error', 'TwelveData batch request failed', {
      error: error instanceof Error ? error.message : error,
      symbols,
      throttleDelayMs
    })

    return {
      data: {},
      errors: symbols.map(symbol => ({
        symbol,
        source: 'batch',
        message: 'Batch request failed',
        details: error instanceof Error ? error.message : error
      })),
      throttleDelayMs
    }
  }
}

const fetchSingleFromApi = async (
  symbol: string
): Promise<{ price?: string; error?: PriceFetchError; throttleDelayMs: number }> => {
  const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${TWELVE_DATA_API_KEY}`
  const throttleDelayMs = await enforceThrottle()

  try {
    const response = await fetch(url)
    if (!response.ok) {
      const bodyText = await response.text()
      throw new Error(`HTTP ${response.status}: ${bodyText}`)
    }

    const payload = (await response.json()) as Record<string, unknown>
    if (isErrorPayload(payload)) {
      return {
        error: {
          symbol,
          source: 'fallback',
          message: 'TwelveData reported error',
          details: payload
        },
        throttleDelayMs
      }
    }

    const price = parsePriceValue(payload)
    if (!price) {
      return {
        error: {
          symbol,
          source: 'fallback',
          message: 'Invalid price payload',
          details: payload
        },
        throttleDelayMs
      }
    }

    log('info', 'TwelveData fallback fetch succeeded', {
      symbol,
      throttleDelayMs
    })

    return { price, throttleDelayMs }
  } catch (error) {
    log('error', 'TwelveData fallback request failed', {
      symbol,
      throttleDelayMs,
      error: error instanceof Error ? error.message : error
    })

    return {
      error: {
        symbol,
        source: 'fallback',
        message: 'Fallback request failed',
        details: error instanceof Error ? error.message : error
      },
      throttleDelayMs
    }
  }
}

const cacheClient = getPriceCacheClient()

export const fetchCurrentPrices = async (assets: AssetDescriptor[]): Promise<PriceFetchSummary> => {
  const uniqueAssets = normaliseAssets(assets)
  if (uniqueAssets.length === 0) {
    log('info', 'No assets provided to price service')
    return {
      prices: {},
      fetchedAt: new Date().toISOString(),
      cacheHits: [],
      apiBatchSymbols: [],
      apiFallbackSymbols: [],
      staleSymbols: [],
      errors: [],
      throttleDelayMs: 0
    }
  }

  if (shouldUseStub()) {
    log('info', 'Returning stubbed price data (local testing mode)', {
      symbolCount: uniqueAssets.length
    })
    const prices = uniqueAssets.reduce<TickerPriceMap>((acc, asset) => {
      const price = buildStubPrice(asset.symbol)
      acc[asset.symbol] = { price }
      return acc
    }, {})

    return {
      prices,
      fetchedAt: new Date().toISOString(),
      cacheHits: [],
      apiBatchSymbols: uniqueAssets.map(asset => asset.symbol),
      apiFallbackSymbols: [],
      staleSymbols: [],
      errors: [],
      throttleDelayMs: 0
    }
  }

  const cacheResult = await cacheClient.read(uniqueAssets)
  const prices: TickerPriceMap = {}
  const staleSymbols: string[] = []
  const symbolsRequiringFetch: AssetDescriptor[] = []

  for (const asset of uniqueAssets) {
    const cacheEntry = cacheResult.records[asset.symbol]

    if (cacheEntry && isCacheEntryFresh(cacheEntry)) {
      const priceValue =
        typeof cacheEntry.currentPrice === 'number'
          ? cacheEntry.currentPrice
          : undefined
      if (typeof priceValue === 'number' && !Number.isNaN(priceValue)) {
        prices[asset.symbol] = { price: priceValue.toString() }
        continue
      }
    }

    if (cacheEntry && isCacheEntryStale(cacheEntry)) {
      staleSymbols.push(asset.symbol)
    }

    symbolsRequiringFetch.push(asset)
  }

  const apiBatchSymbols: string[] = []
  const apiFallbackSymbols: string[] = []
  const errors: PriceFetchError[] = []
  let totalThrottleDelayMs = 0

  if (symbolsRequiringFetch.length > 0) {
    const batchSymbols = symbolsRequiringFetch.map(asset => asset.symbol)
    apiBatchSymbols.push(...batchSymbols)
    const batchResult = await fetchBatchFromApi(batchSymbols)
    totalThrottleDelayMs += batchResult.throttleDelayMs

    const toCache: Record<string, PriceCacheEntry> = {}
    const nowIso = new Date().toISOString()

    for (const asset of symbolsRequiringFetch) {
      const price = batchResult.data[asset.symbol]
      if (price) {
        prices[asset.symbol] = { price }
        toCache[asset.symbol] = {
          currentPrice: Number.parseFloat(price),
          cachedAt: nowIso
        }
      }
    }

    errors.push(...batchResult.errors)

    const fallbackSymbols = symbolsRequiringFetch
      .map(asset => asset.symbol)
      .filter(symbol => !prices[symbol])

    if (fallbackSymbols.length > 0) {
      for (const symbol of fallbackSymbols) {
        apiFallbackSymbols.push(symbol)
        const result = await fetchSingleFromApi(symbol)
        totalThrottleDelayMs += result.throttleDelayMs
        if (result.price) {
          prices[symbol] = { price: result.price }
          toCache[symbol] = {
            currentPrice: Number.parseFloat(result.price),
            cachedAt: nowIso
          }
        } else if (result.error) {
          errors.push(result.error)
        }
      }
    }

    if (Object.keys(toCache).length > 0) {
      try {
        await cacheClient.write(toCache)
      } catch (cacheError) {
        log('warn', 'Failed to persist price cache entries', {
          error: cacheError instanceof Error ? cacheError.message : cacheError,
          symbolCount: Object.keys(toCache).length
        })
      }
    }
  }

  const fetchedAt = new Date().toISOString()

  return {
    prices,
    fetchedAt,
    cacheHits: cacheResult.hits,
    apiBatchSymbols,
    apiFallbackSymbols,
    staleSymbols,
    errors,
    throttleDelayMs: totalThrottleDelayMs
  }
}
