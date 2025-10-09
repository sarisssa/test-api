export interface DynamoDBRefreshTokenItem {
  pk: `REFRESH#${string}`;
  sk: 'REFRESH';
  PK?: `REFRESH#${string}`;
  SK?: 'REFRESH';
  EntityType: 'RefreshToken';
  tokenId: string;
  hashedToken: string;
  userId: string;
  phoneNumber: string;
  createdAt: string;
  expiresAt: string;
  expiresAtEpochSeconds: number;
}
