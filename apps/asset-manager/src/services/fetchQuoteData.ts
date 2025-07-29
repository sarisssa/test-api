import axios from "axios";
import { logger } from "../utils/logger";
import { metrics } from "./metrics";

const BASE_URL = "https://api.twelvedata.com/quote";
const API_KEY = process.env.TWELVE_API_KEY;

export async function fetchQuoteData(symbols: string[]) {
  const startTime = Date.now();
  const result: Record<string, Record<string, any>> = {};
  const joined = symbols.join(",");

  try {
    const res = await axios.get(BASE_URL, {
      params: {
        symbol: joined,
        apikey: API_KEY,
        rolling_period: 30,
      },
    });

    const data = res.data;

    if (symbols.length === 1 && typeof data === "object" && !data.status) {
      // single symbol response
      const symbol = symbols[0];
      result[symbol] = {
        name: data.name,
        exchange: data.exchange,
        currency: data.currency,
        average_volume: data.average_volume,
        rolling_1day_change: data.rolling_1day_change,
        rolling_7day_change: data.rolling_7day_change,
        rolling_period_change: data.rolling_period_change,
        fifty_two_week_low: data.fifty_two_week?.low,
        fifty_two_week_high: data.fifty_two_week?.high,
        fifty_two_week_range: data.fifty_two_week?.range,
        updated_at: new Date().toISOString(),
      };
    } else if (typeof data === "object" && !data.status) {
      // batched response: data is an object keyed by symbol
      for (const symbol of symbols) {
        const quote = data[symbol];
        if (quote && !quote.status) {
          result[symbol] = {
            name: quote.name,
            exchange: quote.exchange,
            currency: quote.currency,
            average_volume: quote.average_volume,
            rolling_1day_change: quote.rolling_1day_change,
            rolling_7day_change: quote.rolling_7day_change,
            rolling_period_change: quote.rolling_period_change,
            fifty_two_week_low: quote.fifty_two_week?.low,
            fifty_two_week_high: quote.fifty_two_week?.high,
            fifty_two_week_range: quote.fifty_two_week?.range,
            updated_at: new Date().toISOString(),
          };
        } else {
          logger.info(`[QUOTE] No or error data for symbol ${symbol}`, quote);
        }
      }
    } else {
      logger.info("[QUOTE] Unexpected API response format:", data);
    }

    const duration = Date.now() - startTime;
    metrics.recordApiCall('quote', true, duration);

  } catch (err: any) {
    const duration = Date.now() - startTime;
    metrics.recordApiCall('quote', false, duration);
    logger.error("[QUOTE] Axios error:", err.message);
  }

  return result;
}