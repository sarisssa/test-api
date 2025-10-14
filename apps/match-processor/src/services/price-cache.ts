import Redis from 'ioredis'
import type { Redis as RedisClient, RedisOptions } from 'ioredis'
import { getAssetPriceRecords, type AssetPriceRecord } from './dynamo-service.js'

type CacheStrategy = 'none' | 'dynamo' | 'redis'

const CACHE_STRATEGY = (process.env.PRICE_CACHE_STRATEGY ?? 'dynamo').toLowerCase() as CacheStrategy
const CACHE_TTL_SECONDS = Number.parseInt(process.env.PRICE_CACHE_TTL_SECONDS ?? '60', 10)
const CACHE_STALE_THRESHOLD_SECONDS = Number.parseInt(
  process.env.PRICE_CACHE_STALE_THRESHOLD_SECONDS ?? (CACHE_TTL_SECONDS * 2).toString(),
  10
)

type PriceCacheEntry = AssetPriceRecord & { cachedAt?: string }

interface CacheResult {
  records: Record<string, PriceCacheEntry>
  hits: string[]
  misses: string[]
}

export type AssetDescriptor = {
  symbol: string
  assetType: 'STOCK' | 'CRYPTO' | 'COMMODITY'
}

interface PriceCacheClient {
  read(assets: AssetDescriptor[]): Promise<CacheResult>
  write(entries: Record<string, PriceCacheEntry>): Promise<void>
  dispose(): Promise<void>
}

class NoopCache implements PriceCacheClient {
  async read(assets: AssetDescriptor[]): Promise<CacheResult> {
    return {
      records: Object.fromEntries(assets.map(({ symbol }) => [symbol, {}])),
      hits: [],
      misses: assets.map(({ symbol }) => symbol)
    }
  }

  async write(): Promise<void> {
    // no-op
  }

  async dispose(): Promise<void> {
    // no-op
  }
}

class DynamoCache implements PriceCacheClient {
  async read(assets: AssetDescriptor[]): Promise<CacheResult> {
    const assetRecords = await getAssetPriceRecords(assets)

    const records: Record<string, PriceCacheEntry> = {}
    const hits: string[] = []
    const misses: string[] = []

    for (const { symbol } of assets) {
      const record = assetRecords[symbol]
      if (record && typeof record.currentPrice === 'number') {
        records[symbol] = {
          ...record,
          cachedAt: record.lastUpdated
        }
        hits.push(symbol)
      } else {
        records[symbol] = {}
        misses.push(symbol)
      }
    }

    return { records, hits, misses }
  }

  async write(): Promise<void> {
    // DynamoDB updates happen through existing batch update logic.
  }

  async dispose(): Promise<void> {
    // no-op
  }
}

class RedisCache implements PriceCacheClient {
  private client: RedisClient

  constructor() {
    const url = process.env.REDIS_URL
    if (!url) {
      throw new Error('REDIS_URL is required when PRICE_CACHE_STRATEGY=redis')
    }

    const rejectUnauthorized = (process.env.REDIS_TLS_REJECT_UNAUTHORIZED ?? 'false').toLowerCase() !== 'false'

    const options: RedisOptions = {}
    const redisUrl = new URL(url)
    if (redisUrl.protocol === 'rediss:') {
      options.tls = {
        rejectUnauthorized,
        host: redisUrl.hostname,
        servername: redisUrl.hostname
      }
    }

    const RedisCtor = Redis as unknown as {
      new (url: string, options?: RedisOptions): RedisClient
    }
    this.client = new RedisCtor(url, options)
  }

  async read(assets: AssetDescriptor[]): Promise<CacheResult> {
    if (assets.length === 0) {
      return { records: {}, hits: [], misses: [] }
    }

    const pipeline = this.client.pipeline()
    const symbols = assets.map(asset => asset.symbol)
    symbols.forEach(symbol => pipeline.get(this.key(symbol)))
    const responses = (await pipeline.exec()) as Array<[unknown, string | null]> | null

    const records: Record<string, PriceCacheEntry> = {}
    const hits: string[] = []
    const misses: string[] = []

    responses?.forEach((response, index) => {
      const value = response?.[1] ?? null
      const symbol = symbols[index]
      if (value) {
        try {
          const parsed = JSON.parse(value) as PriceCacheEntry
          records[symbol] = parsed
          hits.push(symbol)
          return
        } catch {
          // fallthrough to miss
        }
      }
      records[symbol] = {}
      misses.push(symbol)
    })

    return { records, hits, misses }
  }

  async write(entries: Record<string, PriceCacheEntry>): Promise<void> {
    const pipeline = this.client.pipeline()
    const ttlSeconds = Math.max(1, CACHE_TTL_SECONDS)

    for (const [symbol, entry] of Object.entries(entries)) {
      pipeline.setex(this.key(symbol), ttlSeconds, JSON.stringify(entry))
    }

    await pipeline.exec()
  }

  async dispose(): Promise<void> {
    await this.client.quit()
  }

  private key(symbol: string): string {
    return `price:${symbol.toUpperCase()}`
  }
}

let cacheClient: PriceCacheClient | null = null

export const getPriceCacheClient = (): PriceCacheClient => {
  if (cacheClient) {
    return cacheClient
  }

  switch (CACHE_STRATEGY) {
    case 'redis':
      cacheClient = new RedisCache()
      break
    case 'dynamo':
      cacheClient = new DynamoCache()
      break
    default:
      cacheClient = new NoopCache()
      break
  }

  return cacheClient
}

export const isCacheEntryFresh = (entry: PriceCacheEntry): boolean => {
  if (!entry || typeof entry.currentPrice !== 'number') {
    return false
  }

  const timestamp =
    entry.cachedAt ??
    entry.lastUpdated ??
    (typeof entry.currentPrice === 'number' ? new Date().toISOString() : undefined)

  if (!timestamp) {
    return false
  }

  const ageMs = Date.now() - new Date(timestamp).getTime()
  return ageMs <= CACHE_TTL_SECONDS * 1000
}

export const isCacheEntryStale = (entry: PriceCacheEntry): boolean => {
  if (!entry || (!entry.cachedAt && !entry.lastUpdated)) {
    return true
  }

  const timestamp = entry.cachedAt ?? entry.lastUpdated

  if (!timestamp) {
    return true
  }

  const ageMs = Date.now() - new Date(timestamp).getTime()
  return ageMs > CACHE_STALE_THRESHOLD_SECONDS * 1000
}

export type { CacheResult, PriceCacheEntry }
