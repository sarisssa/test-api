import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config();

const API_KEY = process.env.TWELVE_DATA_API_KEY;
const DATA_DIR = 'data';

async function fetchDataAndSave() {
  console.log('--- Starting data fetch process ---');

  const symbols = [
    'NVDA',
    'MSFT',
    'AAPL',
    'AMZN',
    'META',
    'AVGO',
    'GOOG',
    'TSLA',
    'BRK.B',
    'JPM',
    'WMT',
    'ORCL',
    'LLY',
    'V',
    'MA',
    'NFLX',
    'XOM',
    'COST',
    'JNJ',
    'HD',
    'PLTR',
    'PG',
    'BAC',
    'ABBV',
    'CVX',
    'KO',
    'AMD',
    'GE',
    'TMUS',
    'CSCO',
    'WFC',
    'CRM',
    'PM',
    'IBM',
    'UNH',
    'MS',
    'INTU',
    'GS',
    'ABT',
    'LIN',
    'MCD',
    'DIS',
    'AXP',
    'RTX',
    'MRK',
    'NOW',
    'CAT',
    'PEP',
    'T',
    'TMO',
    'UBER',
    'VZ',
    'BKNG',
    'QCOM',
    'ISRG',
    'SCHW',
    'TXN',
    'C',
    'ACN',
    'GEV',
    'BLK',
    'BA',
    'AMGN',
    'SPGI',
    'ADBE',
    'BSX',
    'ETN',
    'SYK',
    'AMAT',
    'ANET',
    'NEE',
    'DHR',
    'GILD',
    'PGR',
    'TJX',
    'HON',
    'DE',
    'BX',
    'PFE',
    'COF',
    'KKR',
    'UNP',
    'PANW',
    'LOW',
    'APH',
    'LRCX',
    'ADP',
    'MU',
    'COP',
    'CMCSA',
    'KLAC',
    'VRTX',
    'MDT',
    'SNPS',
    'CRWD',
    'NKE',
    'ADI',
    'WELL',
    'SBUX',
  ];

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error(`Error creating directory ${DATA_DIR}:`, err);
    return;
  }

  for (const symbol of symbols) {
    try {
      console.log(`Fetching metadata for ${symbol}...`);

      const url = new URL('https://api.twelvedata.com/profile');
      url.searchParams.append('symbol', symbol);

      if (!API_KEY) {
        throw new Error('API_KEY is not set');
      }

      url.searchParams.append('apikey', API_KEY);
      url.searchParams.append('source', 'docs');

      const response = await fetch(url);

      if (!response.ok) {
        console.error(
          `HTTP Error for ${symbol}: ${response.status} ${response.statusText}`
        );
        continue;
      }

      const data = await response.json();

      if (
        data &&
        typeof data === 'object' &&
        'status' in data &&
        data.status === 'error'
      ) {
        console.error(`API Error for ${symbol}`);
        continue;
      }

      const filePath = path.join(DATA_DIR, `${symbol.replace('/', '_')}.json`);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`Successfully saved data to ${filePath}`);

      console.log(`Waiting for 15 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 15000));
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error during API call for ${symbol}:`, error.message);
      } else {
        console.error(
          `An unexpected error occurred during API call for ${symbol}`
        );
      }
    }
  }
  console.log('--- Data fetch process completed. ---');
}

fetchDataAndSave();
