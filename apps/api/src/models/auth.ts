export interface DynamoDBRefreshTokenItem {
  pk: `REFRESH#${string}`;
  sk: 'REFRESH';
  EntityType: 'RefreshToken';
  tokenId: string;
  hashedToken: string;
  userId: string;
  phoneNumber: string;
  createdAt: string;
  expiresAt: string;
  expiresAtEpochSeconds: number;
}
