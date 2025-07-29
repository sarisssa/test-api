import axios from "axios";
import { logger } from "../utils/logger";
import { metrics } from "./metrics";

const BASE_URL = "https://api.twelvedata.com/price";
const API_KEY = process.env.TWELVE_API_KEY;

async function fetchPrices(symbols: string[]) {
  const startTime = Date.now();
  const result: Record<string, { price: string }> = {};
  const joined = symbols.join(",");

  try {
    const res = await axios.get(BASE_URL, {
      params: { symbol: joined, apikey: API_KEY }
    });

    const data = res.data;

    if (symbols.length === 1 && typeof data === "object" && data.price) {
      const symbol = symbols[0];
      result[symbol] = { price: data.price };
    } else if (typeof data === "object") {
      for (const symbol of symbols) {
        if (data[symbol] && data[symbol].price) {
          result[symbol] = { price: data[symbol].price };
        } else if (data[symbol]?.code === 400 || data[symbol]?.status === "error") {
          logger.error(`[PRICE] Error for symbol ${symbol}: ${data[symbol]?.message || "Unknown error"}`);
        }
      }
    } else {
      logger.error("[PRICE] Unexpected API response format:", data);
    }

    const duration = Date.now() - startTime;
    metrics.recordApiCall('price', true, duration);

  } catch (err: any) {
    const duration = Date.now() - startTime;
    metrics.recordApiCall('price', false, duration);
    logger.error("[PRICE] Axios error:", err.message);
  }

  return result;
}

export const fetchStockData = fetchPrices;
export const fetchCommoditiesData = fetchPrices;
export const fetchCryptoData = fetchPrices;
export const fetchIndicesData = fetchPrices;