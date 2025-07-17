export interface DynamoDBMatchItem {
  PK: `MATCH#${string}`;
  SK: 'DETAILS';
  EntityType: 'Match';

  matchId: string;
  players: string[];
  status: 'created' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;

  startedAt?: string;
  endedAt?: string;
  winner?: string;
  gameData?: {
    duration?: number;
    scores?: Record<string, number>;
  };
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
