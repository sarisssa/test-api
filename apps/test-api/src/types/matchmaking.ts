export interface MatchmakingJob {
  userId: string;
  timestamp: number;
  action: 'player_joined_matchmaking' | 'player_cancelled_matchmaking';
  attempts: number;
}

export interface MatchResult {
  matchId: string;
  players: string[];
  createdAt: number;
}
