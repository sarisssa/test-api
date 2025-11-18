export interface DynamoDBUserItem {
  pk: `USER#${string}`;
  sk: 'PROFILE';
  EntityType: 'User';
  userId: string;
  hashedPhoneNumber: string;
  //TODO: Encrypt at rest
  phoneNumber: string;
  username?: string;
  emailAddress?: string;
  createdAt: string;
  lastLoggedIn?: string;
  stats: {
    totalMatches: number;
    wins: number;
    losses: number;
    experience: number;
    inGameCurrency: number;
    capital: number;
  };
  avatarId?: string;
  profilePictureUrl?: string;
  bio?: string;
  perks?: {
    [perkId: string]: {
      purchasedAt: string;
      quantity: number;
    };
  };
}

export interface UserPublicProfile {
  userId: string;
  phoneNumber: string;
  username?: string;
  emailAddress?: string;
  stats: {
    totalMatches: number;
    wins: number;
    losses: number;
    experience: number;
    inGameCurrency: number;
  };
  avatarId?: string;
  profilePictureUrl?: string;
  bio?: string;

  perks?: {
    [perkId: string]: {
      purchasedAt: string;
      quantity: number;
    };
  };
  recentMatches?: Array<{
    id: string;
    opponentId: string;
    opponentUsername: string;
    opponentProfilePictureUrl?: string | null;
    opponentAvatarId: string;
    result: 'win' | 'loss' | 'pending';
    wagerAmount: number;
    duration: number;
    category: 'stock' | 'crypto' | 'commodities';
    createdAt: string;
    tentativeEndTime: string;
    endedAt?: string;
    performancePercentage: number;
    opponentPerformancePercentage: number;
  }>;
  createdAt: string;
  lastLoggedIn?: string;
}
