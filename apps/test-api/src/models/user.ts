export interface DynamoDBUserItem {
  PK: `USER#${string}`;
  SK: 'PROFILE';
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
  };

  profile?: {
    profilePictureUrl?: string;
    bio?: string;
  };
}
