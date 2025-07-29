export interface DynamoDBAssetItem {
  PK: `ASSET#${'STOCK' | 'CRYPTO' | 'COMMODITY'}`;
  SK: string;
  EntityType: 'Asset';
  AssetType: 'STOCK' | 'CRYPTO' | 'COMMODITY';
  Symbol: string;
  name: string;
  currentPrice: number;
  lastUpdated: string;
  description?: string;
  marketCap?: number;
  volume24h?: number;
  change24h?: number;
  high24h?: number;
  low24h?: number;

  //STOCK
  exchange?: string;
  mic_code?: string;
  sector?: string;
  industry?: string;
  employees?: number;
  website?: string;
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
