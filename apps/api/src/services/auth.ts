import { FastifyInstance } from 'fastify';
import { formatPhoneNumber } from '../utils/phone-utils.js';
import { createUser, findUserByPhone, updateUserLastLogin } from './user.js';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  calculateRefreshTokenExpiry,
  generateRefreshToken,
  hashRefreshToken,
} from '../utils/token-utils.js';
import { DynamoDBUserItem } from '../models/user.js';

export const sendOtp = async (
  fastify: FastifyInstance,
  phoneNumber: string
) => {
  phoneNumber = formatPhoneNumber(phoneNumber);

  try {
    const verification = await fastify.twilio.verify.v2
      .services(fastify.config.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({
        channel: 'sms',
        to: phoneNumber,
      });

    fastify.log.info({
      verificationSid: verification.sid,
      phoneNumber,
      status: verification.status,
      msg: 'OTP send request processed by Twilio',
    });

    return verification;
  } catch (error) {
    fastify.log.error({
      error,
      phoneNumber,
      msg: 'Failed to send OTP via Twilio',
    });

    throw new Error('Failed to send OTP. Please try again.');
  }
};

const issueTokensForUser = async (
  fastify: FastifyInstance,
  user: DynamoDBUserItem
) => {
  const accessToken = fastify.jwt.sign(
    {
      userId: user.userId,
      phoneNumber: user.phoneNumber,
    },
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );

  const { token: refreshToken, tokenId } = generateRefreshToken();
  const hashedToken = hashRefreshToken(refreshToken);
  const { expiresAtIso, expiresAtEpochSeconds } = calculateRefreshTokenExpiry();

  await fastify.repositories.refreshToken.persistRefreshToken({
    pk: `REFRESH#${hashedToken}`,
    sk: 'REFRESH',
    PK: `REFRESH#${hashedToken}`,
    SK: 'REFRESH',
    EntityType: 'RefreshToken',
    tokenId,
    hashedToken,
    userId: user.userId,
    phoneNumber: user.phoneNumber,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAtIso,
    expiresAtEpochSeconds,
  });

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt: expiresAtIso,
  };
};

export const verifyOtp = async (
  fastify: FastifyInstance,
  phoneNumber: string,
  code: string
) => {
  phoneNumber = formatPhoneNumber(phoneNumber);

  try {
    const verification = await fastify.twilio.verify.v2
      .services(fastify.config.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: phoneNumber,
        code,
      });

    if (verification.status !== 'approved') {
      fastify.log.warn({
        verificationSid: verification.sid,
        phoneNumber,
        status: verification.status,
        msg: 'OTP verification failed: Invalid code',
      });
      throw new Error('Invalid OTP code');
    }

    fastify.log.info({
      verificationSid: verification.sid,
      phoneNumber,
      msg: 'OTP verified successfully by Twilio',
    });

    let user = await findUserByPhone(fastify, phoneNumber);
    const isNewUser = !user;

    if (!user) {
      user = await createUser(fastify, phoneNumber);
      fastify.log.info({
        userId: user.userId,
        phoneNumber,
        msg: 'New user created after OTP verification',
      });
    } else {
      await updateUserLastLogin(fastify, user);
      fastify.log.info({
        userId: user.userId,
        phoneNumber,
        msg: 'Existing user last login updated after OTP verification',
      });
    }

    const tokens = await issueTokensForUser(fastify, user);

    return {
      isNewUser,
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      user: {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        username: user.username,
        stats: user.stats,
        profile: {
          profilePictureUrl: user.profilePictureUrl,
          bio: user.bio,
        },
      },
    };
  } catch (error) {
    fastify.log.error({
      error,
      phoneNumber,
      msg: 'Failed during OTP verification or user processing',
    });

    if (error instanceof Error && error.message === 'Invalid OTP code') {
      throw error;
    }
    throw new Error('An error occurred during verification. Please try again.');
  }
};

export const refreshSession = async (
  fastify: FastifyInstance,
  refreshToken: string
) => {
  const hashedToken = hashRefreshToken(refreshToken);
  const storedToken = await fastify.repositories.refreshToken.getRefreshTokenByHash(
    hashedToken
  );

  if (!storedToken) {
    throw new Error('Invalid refresh token');
  }

  const now = Date.now();
  if (storedToken.expiresAt && new Date(storedToken.expiresAt).getTime() <= now) {
    await fastify.repositories.refreshToken.deleteRefreshTokenByHash(hashedToken);
    throw new Error('Expired refresh token');
  }

  await fastify.repositories.refreshToken.deleteRefreshTokenByHash(hashedToken);

  const user = await fastify.repositories.user.getUserById(storedToken.userId);
  if (!user) {
    throw new Error('User not found for refresh token');
  }

  const tokens = await issueTokensForUser(fastify, user);

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
  };
};
