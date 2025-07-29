import {
  fetchStockData,
  fetchCommoditiesData,
  fetchCryptoData,
  fetchIndicesData,
} from "./fetchPriceData";
import { fetchQuoteData } from "./fetchQuoteData";
import { setAssetData } from "../db/redisOps";
import symbolsData from "../config/symbols.json"
import { logger } from "../utils/logger";
import { metrics } from "./metrics";
import redis from "../config/redis";

// extract lists from JSON
const stockList: string[] = symbolsData.stock || [];
const commoditiesList: string[] = symbolsData.commodity || [];
const cryptoList: string[] = symbolsData.crypto || [];
const indicesList: string[] = symbolsData.index || [];

// create combined symbol array
const allSymbols = [...stockList, ...commoditiesList, ...cryptoList, ...indicesList];

// map symbol to its type
const symbolTypeMap: Record<string, "stock" | "commodity" | "crypto" | "index"> = {};

for (const sym of stockList) symbolTypeMap[sym] = "stock";
for (const sym of commoditiesList) symbolTypeMap[sym] = "commodity";
for (const sym of cryptoList) symbolTypeMap[sym] = "crypto";
for (const sym of indicesList) symbolTypeMap[sym] = "index";

export async function updatePriceData() {
  const startTime = Date.now();
  logger.info(`[FETCH] Prices for ${allSymbols.join(", ")}`);

  const [stockPrices, commodityPrices, cryptoPrices, indexPrices] = await Promise.all([
    fetchStockData(stockList),
    fetchCommoditiesData(commoditiesList),
    fetchCryptoData(cryptoList),
    fetchIndicesData(indicesList),
  ]);

  const allPrices = {
    ...stockPrices,
    ...commodityPrices,
    ...cryptoPrices,
    ...indexPrices,
  };

  logger.info(`[REDIS] Prices for ${allSymbols.join(", ")}`);

  // create pipeline for batch operations
  const pipeline = redis.pipeline();

  for (const symbol of allSymbols) {
    const priceData = allPrices[symbol];
    if (priceData) {
      await setAssetData(symbol, {
        price: priceData.price,
        updated_at: new Date().toISOString(),
        type: symbolTypeMap[symbol],
      }, pipeline); // pass pipeline instead of executing immediately
    }
  }

  // execute all operations in one network round-trip
  await pipeline.exec();
  metrics.recordPipelineBatch();

  const duration = Date.now() - startTime;
  metrics.recordSchedulerRun('price', true, duration);
}

export async function updateQuoteData() {
  const startTime = Date.now();
  logger.info(`[FETCH] Quotes for ${allSymbols.join(", ")}`);

  const quoteData = await fetchQuoteData(allSymbols);

  // create pipeline for batch operations
  const pipeline = redis.pipeline();

  for (const symbol of allSymbols) {
    const data = quoteData[symbol];
    if (data) {
      await setAssetData(symbol, {
        ...data,
        updated_at: new Date().toISOString(),
        type: symbolTypeMap[symbol],
      }, pipeline); // pass pipeline instead of executing immediately
    }
  }

  // execute all operations in one network round-trip
  await pipeline.exec();
  metrics.recordPipelineBatch();

  const duration = Date.now() - startTime;
  metrics.recordSchedulerRun('quote', true, duration);
}
