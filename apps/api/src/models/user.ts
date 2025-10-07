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
  experiencePoints: number;
  stats: {
    totalMatches: number;
    wins: number;
    losses: number;
    experience: number;
    inGameCurrency: number;
    capital: number;
  };
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
  experiencePoints: number;
  stats: {
    totalMatches: number;
    wins: number;
    losses: number;
    experience: number;
    inGameCurrency: number;
    capital: number;
  };
  profile?: {
    profilePictureUrl?: string;
    bio?: string;
  };
  perks?: {
    [perkId: string]: {
      purchasedAt: string;
      quantity: number;
    };
  };
  createdAt: string;
  lastLoggedIn?: string;
}
