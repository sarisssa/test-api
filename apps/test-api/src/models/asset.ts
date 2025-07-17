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
}
