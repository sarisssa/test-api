import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { DynamoDBAssetItem } from '../models/asset.js';
import {
  COMMODITY_ASSETS,
  CRYPTO_ASSETS,
  STOCK_TICKERS,
} from './lib/asset-lists.js';

config();

const TABLE_NAME = 'wage-main-dev';
const DATA_DIR = 'data';

type AssetType = 'STOCK' | 'CRYPTO' | 'COMMODITY';

const client = new DynamoDBClient({
  region: 'us-east-1',
});

const dynamodb = DynamoDBDocumentClient.from(client);

interface StockData {
  symbol: string;
  name: string;
  exchange?: string;
  mic_code?: string;
  sector?: string;
  industry?: string;
  employees?: number;
  website?: string;
  description?: string;
  type?: string;
  CEO?: string;
  address?: string;
  address2?: string;
  city?: string;
  zip?: string;
  state?: string;
  country?: string;
  phone?: string;
}

interface CryptoData {
  symbol: string;
  currency_base: string;
  currency_quote: string;
  assetType: 'CRYPTO';
  description: string;
}

interface CommodityData {
  symbol: string;
  name: string;
  category: string;
  description: string;
  assetType: 'COMMODITY';
}

interface CommoditiesFile {
  data: CommodityData[];
}

function buildAssetPriceItem(
  assetType: AssetType,
  symbol: string,
  currentPrice = 0
): Record<string, unknown> {
  const lastUpdated = new Date().toISOString();
  const upperSymbol = symbol.toUpperCase();
  return {
    pk: `ASSET#${upperSymbol}`,
    sk: 'PRICE',
    EntityType: 'AssetPrice',
    AssetType: assetType,
    assetType,
    Symbol: upperSymbol,
    symbol: upperSymbol,
    currentPrice,
    lastUpdated,
  };
}

const toWriteItem = (item: DynamoDBAssetItem): Record<string, unknown> =>
  item as unknown as Record<string, unknown>;

function transformStockToDynamoDB(stock: StockData): DynamoDBAssetItem {
  const upperSymbol = stock.symbol.toUpperCase();
  return {
    pk: `ASSET#${upperSymbol}`,
    sk: `METADATA`,
    EntityType: 'Asset',
    AssetType: 'STOCK',
    Symbol: upperSymbol,
    name: stock.name,
    currentPrice: 0,
    lastUpdated: new Date().toISOString(),
    description: stock.description,
    exchange: stock.exchange,
    mic_code: stock.mic_code,
    sector: stock.sector,
    industry: stock.industry,
    employees: stock.employees,
    website: stock.website,
    type: stock.type,
    CEO: stock.CEO,
    address: stock.address,
    address2: stock.address2,
    city: stock.city,
    zip: stock.zip,
    state: stock.state,
    country: stock.country,
    phone: stock.phone,
  };
}

function transformCryptoToDynamoDB(crypto: CryptoData): any {
  const upperSymbol = crypto.symbol.toUpperCase();
  return {
    pk: `ASSET#${upperSymbol}`,
    sk: `METADATA`,
    EntityType: 'Asset',
    AssetType: 'CRYPTO',
    Symbol: upperSymbol,
    name: crypto.currency_base,
    currentPrice: 0,
    lastUpdated: new Date().toISOString(),
    description: crypto.description,
  };
}

function transformCommodityToDynamoDB(commodity: CommodityData): any {
  const upperSymbol = commodity.symbol.toUpperCase();
  return {
    pk: `ASSET#${upperSymbol}`,
    sk: `METADATA`,
    EntityType: 'Asset',
    AssetType: 'COMMODITY',
    Symbol: upperSymbol,
    name: commodity.name,
    currentPrice: 0,
    lastUpdated: new Date().toISOString(),
    description: commodity.description,
  };
}

async function batchWrite(items: Array<Record<string, unknown>>) {
  const BATCH_SIZE = 25; // DynamoDB batch write limit
  const batches = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE));
  }

  console.log(`Writing ${items.length} items in ${batches.length} batches...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `Processing batch ${i + 1}/${batches.length} (${batch.length} items)...`
    );

    const writeRequests = batch.map(item => ({
      PutRequest: {
        Item: item,
      },
    }));

    try {
      await dynamodb.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: writeRequests,
          },
        })
      );
      console.log(`✅ Batch ${i + 1} completed`);
    } catch (error) {
      console.error(`❌ Error writing batch ${i + 1}:`, error);
      throw error;
    }
  }
}

async function seedAllAssets() {
  console.log('🚀 Starting comprehensive asset seeding...');

  const metadataBySymbol = new Map<string, DynamoDBAssetItem>();
  const priceItems: Array<Record<string, unknown>> = [];
  const priceKeys = new Set<string>();

  const addMetadata = (item: DynamoDBAssetItem) => {
    metadataBySymbol.set(item.Symbol, item);
  };

  const addPriceRecord = (assetType: AssetType, symbol: string) => {
    const key = `${assetType}#${symbol}`;
    if (priceKeys.has(key)) {
      return;
    }
    priceKeys.add(key);
    priceItems.push(buildAssetPriceItem(assetType, symbol));
  };

  try {
    console.log('📈 Processing stock data...');
    let files: string[] = [];
    try {
      files = await fs.readdir(DATA_DIR);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'ENOENT'
      ) {
        console.warn(
          `  ⚠️  Data directory '${DATA_DIR}' not found. Skipping metadata seed files.`
        );
      } else {
        throw error;
      }
    }
    const stockFiles = files.filter(
      file =>
        file.endsWith('.json') &&
        !file.includes('crypto') &&
        !file.includes('commodities')
    );

    for (const file of stockFiles) {
      try {
        const filePath = path.join(DATA_DIR, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const stockData: StockData = JSON.parse(fileContent);

        const metadataItem = transformStockToDynamoDB(stockData);
        addMetadata(metadataItem);
        addPriceRecord('STOCK', stockData.symbol);

        console.log(`  ✓ Processed stock: ${stockData.symbol}`);
      } catch (error) {
        console.warn(`  ⚠️  Failed to process stock file ${file}:`, error);
      }
    }

    console.log('💰 Processing crypto data...');
    try {
      const cryptoContent = await fs.readFile(
        path.join(DATA_DIR, 'crypto.json'),
        'utf-8'
      );
      const cryptoData: CryptoData[] = JSON.parse(cryptoContent);

      for (const crypto of cryptoData) {
        const metadataItem = transformCryptoToDynamoDB(crypto);
        addMetadata(metadataItem);
        addPriceRecord('CRYPTO', crypto.symbol);
        console.log(`  ✓ Processed crypto: ${crypto.symbol}`);
      }
    } catch (error) {
      console.warn('  ⚠️  Failed to process crypto data:', error);
    }

    console.log('🛢️  Processing commodities data...');
    try {
      const commoditiesContent = await fs.readFile(
        path.join(DATA_DIR, 'commodities.json'),
        'utf-8'
      );
      const commoditiesFile: CommoditiesFile = JSON.parse(commoditiesContent);

      for (const commodity of commoditiesFile.data) {
        const metadataItem = transformCommodityToDynamoDB(commodity);
        addMetadata(metadataItem);
        addPriceRecord('COMMODITY', commodity.symbol);
        console.log(`  ✓ Processed commodity: ${commodity.symbol}`);
      }
    } catch (error) {
      console.warn('  ⚠️  Failed to process commodities data:', error);
    }

    for (const symbol of STOCK_TICKERS) {
      const upperSymbol = symbol.toUpperCase();
      if (!metadataBySymbol.has(upperSymbol)) {
        addMetadata({
          pk: `ASSET#${upperSymbol}`,
          sk: 'METADATA',
          EntityType: 'Asset',
          AssetType: 'STOCK',
          Symbol: upperSymbol,
          name: upperSymbol,
          currentPrice: 0,
          lastUpdated: new Date().toISOString(),
        });
      }
      addPriceRecord('STOCK', upperSymbol);
    }

    for (const asset of CRYPTO_ASSETS) {
      const upperSymbol = asset.symbol.toUpperCase();
      if (!metadataBySymbol.has(upperSymbol)) {
        addMetadata({
          pk: `ASSET#${upperSymbol}`,
          sk: 'METADATA',
          EntityType: 'Asset',
          AssetType: 'CRYPTO',
          Symbol: upperSymbol,
          name: asset.name,
          currentPrice: 0,
          lastUpdated: new Date().toISOString(),
          description: asset.description,
        });
      }
      addPriceRecord('CRYPTO', upperSymbol);
    }

    for (const asset of COMMODITY_ASSETS) {
      const upperSymbol = asset.symbol.toUpperCase();
      if (!metadataBySymbol.has(upperSymbol)) {
        addMetadata({
          pk: `ASSET#${upperSymbol}`,
          sk: 'METADATA',
          EntityType: 'Asset',
          AssetType: 'COMMODITY',
          Symbol: upperSymbol,
          name: asset.name,
          currentPrice: 0,
          lastUpdated: new Date().toISOString(),
          description: asset.description,
        });
      }
      addPriceRecord('COMMODITY', upperSymbol);
    }

    const metadataItems = Array.from(metadataBySymbol.values());
    const counts = {
      stock: metadataItems.filter(item => item.AssetType === 'STOCK').length,
      crypto: metadataItems.filter(item => item.AssetType === 'CRYPTO').length,
      commodity: metadataItems.filter(item => item.AssetType === 'COMMODITY')
        .length,
    };

    const allItems: Array<Record<string, unknown>> = [
      ...metadataItems.map(toWriteItem),
      ...priceItems,
    ];

    const totalAssets = counts.stock + counts.crypto + counts.commodity;
    const priceRecordCount = priceItems.length;

    console.log(`\n💾 Writing ${allItems.length} total items to DynamoDB...`);
    await batchWrite(allItems);

    console.log(`\n🎉 Successfully seeded ${totalAssets} assets!`);
    console.log(`   📈 Stocks: ${counts.stock}`);
    console.log(`   💰 Crypto: ${counts.crypto}`);
    console.log(`   🛢️  Commodities: ${counts.commodity}`);
    console.log(`   💾 Price records: ${priceRecordCount}`);
  } catch (error) {
    console.error('💥 Fatal error during seeding:', error);
    process.exit(1);
  }
}

// Allow running as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  seedAllAssets()
    .then(() => {
      console.log('✨ Asset seeding completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

export { seedAllAssets };
