export interface RefreshTokenPayload {
  userId: string;
  phoneNumber: string;
  type: 'refresh';
  tokenId: string;
}

export interface CreateRefreshTokenParams {
  userId: string;
  token: string;
  deviceInfo?: {
    deviceId?: string;
    deviceName?: string;
    userAgent?: string;
    ipAddress?: string;
  };
  expiresInDays?: number;
}

export interface RefreshTokenResponse {
  tokenId: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
}
