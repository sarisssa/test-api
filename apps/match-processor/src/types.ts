export enum AssetType {
  STOCK = 'STOCK',
  CRYPTO = 'CRYPTO',
  COMMODITY = 'COMMODITY'
}

export interface Asset {
  selectedAt: string
  ticker: string
  shares: number
  currentPrice: number
  lastUpdatedAt: string
  initialPrice: number
  assetType: AssetType
}

export interface Portfolio {
  initialValue: number
  currentValue: number
  assets: Asset[]
}

export interface PlayerAssets {
  readyAt: string
  assets: Array<{
    selectedAt: string
    ticker: string
    assetType: AssetType
  }>
}

export interface Match {
  EntityType: 'Match'
  createdAt: string
  matchStartedAt?: string
  matchTentativeEndTime?: string
  matchEndedAt?: string
  playerAssets: Record<string, PlayerAssets>
  players: string[]
  SK: string
  portfolios: Record<string, Portfolio>
  assetSelectionEndedAt?: string
  PK: string
  assetSelectionStartedAt?: string
  matchId: string
  status: 'asset_selection' | 'in_progress' | 'completed' | 'cancelled'
  winnerId?: string
}

export interface PriceData {
  price: string
}

export type TickerPriceMap = Record<string, PriceData>
