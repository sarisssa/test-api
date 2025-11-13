import { ChatMessageId } from '../constants.js';
import { PlayerAssetSelections } from '../types/match.js';

//We have both Tentaive End Time and End Time since we may support user ability to surrender the match before the tentative end time.

interface DynamoDBChatMessage {
  senderId: string;
  username: string;
  messageId: ChatMessageId;
  createdAt: string;
}

export interface DynamoDBMatchItem {
  pk: `MATCH#${string}`;
  sk: 'DETAILS';
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
  chatMessages?: DynamoDBChatMessage[];
  chatMessageCounts?: Record<string, number>;
  matchEndedAt?: string;
  matchSettlementExecutionArn?: string;
  matchCompletionBroadcastedAt?: string; // Set by BroadcastCompletion Lambda
  completionReason?: 'time_expired' | 'forfeited' | 'manual';
  winner?: string;
  loser?: string;
  finalScores?: Record<string, number>;

  // --- Match-Level Metadata for Price Updates ---
  lastPriceUpdateAt?: string;
  priceUpdateCount?: number;
}

export interface DynamoDBPlayerMatchItem {
  pk: `USER#${string}`;
  sk: `MATCH#${string}`;
  EntityType: 'PlayerMatch';
  id: string;
  opponentId: string;
  opponentUsername: string;
  result: 'win' | 'loss' | 'pending';
  wagerAmount: number;
  duration: number;
  category: 'stock' | 'crypto' | 'commodities';
  createdAt: string;
  startedAt?: string;
  tentativeEndTime: string;
  endedAt?: string;
  performancePercentage?: number;
  opponentPerformancePercentage?: number;
}
