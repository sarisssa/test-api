import redis from "../config/redis";
import { logger } from "../utils/logger";
import { metrics } from "../services/metrics";

// no TTL set; data will persist until explicitly updated or deleted
export async function setAssetData(
  symbol: string, 
  newData: Record<string, string>, 
  pipeline?: any
) {
  const startTime = Date.now();
  const key = `asset:${symbol}`;
  
  try {
    const existing = await redis.hgetall(key);

    const updated = {
      price: newData.price ?? existing.price,
      name: newData.name ?? existing.name,
      exchange: newData.exchange ?? existing.exchange,
      currency: newData.currency ?? existing.currency,
      average_volume: newData.average_volume ?? existing.average_volume,
      rolling_1day_change: newData.rolling_1day_change ?? existing.rolling_1day_change,
      rolling_7day_change: newData.rolling_7day_change ?? existing.rolling_7day_change,
      rolling_period_change: newData.rolling_period_change ?? existing.rolling_period_change,
      fifty_two_week_low: newData.fifty_two_week_low ?? existing.fifty_two_week_low,
      fifty_two_week_high: newData.fifty_two_week_high ?? existing.fifty_two_week_high,
      fifty_two_week_range: newData.fifty_two_week_range ?? existing.fifty_two_week_range,
      updated_at: new Date().toISOString(),
      type: newData.type ?? existing.type,
    };

    if (pipeline) {
      // add to pipeline instead of executing immediately
      pipeline.hmset(key, updated);
    } else {
      // fallback to immediate execution
      await redis.hmset(key, updated);
    }

    const duration = Date.now() - startTime;
    metrics.recordRedisOperation(true, duration);
  } catch (err) {
    const duration = Date.now() - startTime;
    metrics.recordRedisOperation(false, duration);
    logger.error(`[REDIS] Error setting asset data for ${symbol}:`, err);
    throw err;
  }
}

// retrieves all data for a given asset symbol from Redis
export async function getAssetData(symbol: string) {
  return await redis.hgetall(`asset:${symbol}`);
}