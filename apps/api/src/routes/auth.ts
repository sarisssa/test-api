import { FastifyInstance } from 'fastify';
import { refreshSession, sendOtp, verifyOtp } from '../services/auth.js';
import {
  SendOtpBody,
  sendOtpJsonSchema,
  RefreshTokenBody,
  refreshTokenJsonSchema,
  VerifyOtpBody,
  verifyOtpJsonSchema,
} from '../types/auth.js';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: SendOtpBody }>(
    '/send-otp',
    {
      schema: {
        body: sendOtpJsonSchema,
      },
    },
    async (request, reply) => {
      const { phoneNumber } = request.body;

      try {
        await sendOtp(fastify, phoneNumber);
        reply.status(200).send({ message: 'OTP sent successfully' });
      } catch (error) {
        fastify.log.error({ error, msg: 'Error sending OTP' });
        reply.status(500).send({
          message: 'Failed to send OTP',
          error: (error as Error).message,
        });
      }
    }
  );

  fastify.post<{ Body: VerifyOtpBody }>(
    '/verify-otp',
    {
      schema: {
        body: verifyOtpJsonSchema,
      },
    },
    async (request, reply) => {
      try {
        const { phoneNumber, code } = request.body;
        const verifyResult = await verifyOtp(fastify, phoneNumber, code);

        reply.send({
          message: verifyResult.isNewUser
            ? 'Account created successfully'
            : 'Logged in successfully',
          token: verifyResult.token,
          accessToken: verifyResult.accessToken,
          refreshToken: verifyResult.refreshToken,
          refreshTokenExpiresAt: verifyResult.refreshTokenExpiresAt,
          user: verifyResult.user,
        });
      } catch (error) {
        fastify.log.error({
          error,
          msg: 'Error during OTP verification or user processing',
        });

        reply.status(500).send({
          message: 'An unexpected error occurred during login/signup.',
          error: (error as Error).message,
        });
      }
    }
  );

  fastify.post<{ Body: RefreshTokenBody }>(
    '/token/refresh',
    {
      schema: {
        body: refreshTokenJsonSchema,
      },
    },
    async (request, reply) => {
      try {
        const { refreshToken } = request.body;
        const tokens = await refreshSession(fastify, refreshToken);
        reply.send({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
        });
      } catch (error) {
        fastify.log.error({
          error,
          msg: 'Failed to refresh session',
        });
        reply.status(401).send({
          message: 'Invalid or expired refresh token',
        });
      }
    }
  );
}
