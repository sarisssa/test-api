import { createHash, randomBytes } from 'crypto';

const DEFAULT_REFRESH_TOKEN_BYTE_LENGTH = 48;

export const ACCESS_TOKEN_EXPIRES_IN = '1d';

// 365 days in milliseconds
export const REFRESH_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export const generateRefreshToken = (): { token: string; tokenId: string } => {
  const token = randomBytes(DEFAULT_REFRESH_TOKEN_BYTE_LENGTH).toString('hex');
  const tokenId = randomBytes(16).toString('hex');
  return { token, tokenId };
};

export const hashRefreshToken = (token: string): string => {
  return createHash('sha256').update(token).digest('hex');
};

export const calculateRefreshTokenExpiry = (): {
  expiresAtIso: string;
  expiresAtEpochSeconds: number;
} => {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  return {
    expiresAtIso: expiresAt.toISOString(),
    expiresAtEpochSeconds: Math.floor(expiresAt.getTime() / 1000),
  };
};
