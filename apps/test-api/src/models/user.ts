export interface DynamoDBUserItem {
  PK: `USER#${string}`;
  SK: 'PROFILE';
  EntityType: 'User';
  userId: string;
  phoneNumber: string;
  username?: string;
  emailAddress?: string;

  createdAt: string;
  lastLoggedIn?: string;
  stats: {
    totalMatches: number;
    wins: number;
    losses: number;
    currentStreak: number;
    longestStreak: number;
    rank: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
    level: number;
  };

  profile?: {
    avatar?: string;
    bio?: string;
    country?: string;
  };
}
