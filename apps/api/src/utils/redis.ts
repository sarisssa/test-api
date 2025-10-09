import Redis, { RedisOptions } from 'ioredis'

type Booleanish = string | boolean | undefined | null

const shouldReject = (value: Booleanish): boolean => {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return value.toLowerCase() !== 'false'
  }
  return true
}

export const buildFastifyRedisOptions = (
  url: string,
  rejectUnauthorizedFlag?: Booleanish,
  overrides: Record<string, unknown> = {}
) => {
  const options: Record<string, unknown> = {
    url,
    ...overrides
  }

  const redisUrl = new URL(url)
  if (redisUrl.protocol === 'rediss:') {
    options.tls = {
      rejectUnauthorized: shouldReject(rejectUnauthorizedFlag),
      host: redisUrl.hostname,
      servername: redisUrl.hostname
    }
  }

  return options;
}

export const createRedisClient = (
  url: string,
  rejectUnauthorizedFlag?: Booleanish,
  options: RedisOptions = {}
) => {
  const redisUrl = new URL(url)
  if (redisUrl.protocol === 'rediss:') {
    options.tls = {
      rejectUnauthorized: shouldReject(rejectUnauthorizedFlag),
      host: redisUrl.hostname,
      servername: redisUrl.hostname,
      ...options.tls
    }
  }

  return new Redis.Redis(url, options)
}
