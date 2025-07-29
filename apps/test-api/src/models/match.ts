import { MatchPortfolios, PlayerAssetSelections } from '../types/match';

export interface DynamoDBMatchItem {
  PK: `MATCH#${string}`;
  SK: 'DETAILS';
  EntityType: 'Match';

  matchId: string;
  players: string[];
  status: 'asset_selection' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;

  // --- Asset Selection Phase ---
  assetSelectionStartedAt: string;
  assetSelectionEndedAt?: string;
  playerAssets: PlayerAssetSelections;

  // --- Match Play Phase ---
  matchStartedAt?: string;
  matchTentativeEndTime?: string;
  matchEndedAt?: string;
  winner?: string;

  portfolios: MatchPortfolios;

  // --- Match-Level Metadata for Price Updates ---
  lastPriceUpdateAt?: string;
  priceUpdateCount?: number;
}

export interface DynamoDBPlayerMatchItem {
  PK: `USER#${string}`;
  SK: `MATCH#${string}`;
  EntityType: 'PlayerMatch';

  matchId: string;
  opponent: string;
  result: 'win' | 'loss' | 'pending';

  duration?: number;
  score?: number;
  createdAt: string;
}
