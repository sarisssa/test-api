export interface DynamoDBChallengeItem {
  pk: `USER#${string}`;
  sk: `CHALLENGE#${string}`;
  EntityType: 'Challenge';
  challengeId: string;
  challengerId: string;
  challengedId: string;
  gsi1_pk: `CHALLENGER#${string}` | `CHALLENGED#${string}`;
  gsi1_sk: `CHALLENGE#${string}`;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  duration: 30 | 60 | 120 | 240;
  amount: 5 | 10 | 15 | 25;
  category: 'stock' | 'crypto' | 'commodities';
  createdAt: string;
  updatedAt: string;
  expiresAt?: string; // ISO timestamp, null for crypto challenges
}

export interface ChallengeResponse {
  challengeId: string;
  challenger: {
    userId: string;
    username?: string;
    profilePictureUrl?: string;
  };
  challenged: {
    userId: string;
    username?: string;
    profilePictureUrl?: string;
  };
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  duration: 30 | 60 | 120 | 240;
  amount: 5 | 10 | 15 | 25;
  category: 'stock' | 'crypto' | 'commodities';
  createdAt: string;
  direction: 'outgoing' | 'incoming';
  expiresAt?: string;
}
