export interface DynamoDBRefreshTokenItem {
  pk: `USER#${string}`;
  sk: `REFRESH_TOKEN#${string}`;
  EntityType: 'RefreshToken';
  tokenId: string;
  userId: string;
  tokenHash: string;
  deviceInfo?: {
    deviceId?: string;
    deviceName?: string;
    userAgent?: string;
    ipAddress?: string;
  };
  issuedAt: string;
  expiresAt: string;
  lastUsedAt?: string;
  isRevoked: boolean;
  revokedAt?: string;
  revokedReason?: 'user_logout' | 'security' | 'replaced' | 'expired';
  gsi1_pk: `TOKEN#${string}`;
  gsi1_sk: `USER#${string}`;
  ttl: number;
}
