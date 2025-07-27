export interface Asset {
  selectedAt: string
  ticker: string
  shares: number
  currentPrice: number
  lastUpdatedAt: string
  initialPrice: number
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
  }>
}

export interface Match {
  EntityType: 'Match'
  createdAt: string
  matchStartedAt?: string
  playerAssets: Record<string, PlayerAssets>
  players: string[]
  SK: string
  portfolios: Record<string, Portfolio>
  assetSelectionEndedAt?: string
  PK: string
  assetSelectionStartedAt?: string
  matchId: string
  status: 'asset_selection' | 'in_progress' | 'completed' | 'cancelled'
}

export interface PriceData {
  price: string
}

export type TickerPriceMap = Record<string, PriceData>
