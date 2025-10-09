export interface DynamoDBUserItem {
  pk: `USER#${string}`;
  sk: 'PROFILE';
  PK?: `USER#${string}`;
  SK?: 'PROFILE';
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
  profilePictureUrl?: string;
  bio?: string;

  perks?: {
    [perkId: string]: {
      purchasedAt: string;
      quantity: number;
    };
  };
  createdAt: string;
  lastLoggedIn?: string;
}
