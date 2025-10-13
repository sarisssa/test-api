import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config();

const TABLE_NAME = 'wage-main-dev';
const DATA_DIR = 'data';

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
  assetType: 'COMMODITIES';
}

interface CommoditiesFile {
  data: CommodityData[];
}

function transformStockToDynamoDB(stock: StockData): any {
  return {
    pk: `ASSET#${stock.symbol}`,
    sk: `METADATA`,
    EntityType: 'Asset',
    AssetType: 'STOCK',
    Symbol: stock.symbol,
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
  return {
    pk: `ASSET#${crypto.symbol}`,
    sk: `METADATA`,
    EntityType: 'Asset',
    AssetType: 'CRYPTO',
    Symbol: crypto.symbol,
    name: crypto.currency_base,
    currentPrice: 0,
    lastUpdated: new Date().toISOString(),
    description: crypto.description,
  };
}

function transformCommodityToDynamoDB(commodity: CommodityData): any {
  return {
    pk: `ASSET#${commodity.symbol}`,
    sk: `METADATA`,
    EntityType: 'Asset',
    AssetType: 'COMMODITY',
    Symbol: commodity.symbol,
    name: commodity.name,
    currentPrice: 0,
    lastUpdated: new Date().toISOString(),
    description: commodity.description,
  };
}

async function batchWrite(items: any[]) {
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

  const allAssets: any[] = [];

  try {
    console.log('📈 Processing stock data...');
    const files = await fs.readdir(DATA_DIR);
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

        const dynamoItem = transformStockToDynamoDB(stockData);
        allAssets.push(dynamoItem);

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
        const dynamoItem = transformCryptoToDynamoDB(crypto);
        allAssets.push(dynamoItem);
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
        const dynamoItem = transformCommodityToDynamoDB(commodity);
        allAssets.push(dynamoItem);
        console.log(`  ✓ Processed commodity: ${commodity.symbol}`);
      }
    } catch (error) {
      console.warn('  ⚠️  Failed to process commodities data:', error);
    }

    console.log(`\n💾 Writing ${allAssets.length} total assets to DynamoDB...`);
    await batchWrite(allAssets);

    console.log(`\n🎉 Successfully seeded ${allAssets.length} assets!`);
    console.log(
      `   📈 Stocks: ${allAssets.filter(a => a.AssetType === 'STOCK').length}`
    );
    console.log(
      `   💰 Crypto: ${allAssets.filter(a => a.AssetType === 'CRYPTO').length}`
    );
    console.log(
      `   🛢️  Commodities: ${allAssets.filter(a => a.AssetType === 'COMMODITY').length}`
    );
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
