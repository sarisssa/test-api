import { FastifyInstance } from 'fastify';
import { refreshAuthTokens, sendOtp, verifyOtp } from '../services/auth.js';
import {
  RefreshTokenBody,
  refreshTokenJsonSchema,
  refreshTokenResponseJsonSchema,
  SendOtpBody,
  sendOtpJsonSchema,
  sendOtpResponseJsonSchema,
  VerifyOtpBody,
  verifyOtpJsonSchema,
  verifyOtpResponseJsonSchema,
} from '../types/auth.js';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: SendOtpBody }>(
    '/send-otp',
    {
      schema: {
        tags: ['auth'],
        description: 'Send OTP code to phone number',
        body: sendOtpJsonSchema,
        response: {
          200: sendOtpResponseJsonSchema,
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
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
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to send OTP',
        });
      }
    }
  );

  fastify.post<{ Body: VerifyOtpBody }>(
    '/verify-otp',
    {
      schema: {
        tags: ['auth'],
        description: 'Verify OTP code and get auth tokens(access + refresh)',
        body: verifyOtpJsonSchema,
        response: {
          200: verifyOtpResponseJsonSchema,
          500: {
            description: 'Failed to verify OTP',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { phoneNumber, code } = request.body;
        const verifyResult = await verifyOtp(
          fastify,
          phoneNumber,
          code,
          request
        );

        reply.send({
          message: verifyResult.isNewUser
            ? 'Account created successfully'
            : 'Logged in successfully',
          accessToken: verifyResult.accessToken,
          refreshToken: verifyResult.refreshToken,
          user: verifyResult.user,
        });
      } catch (error) {
        fastify.log.error({
          error,
          msg: 'Error during OTP verification or user processing',
        });

        if (error instanceof Error && error.message === 'Invalid OTP code') {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Invalid OTP code',
          });
        }

        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred during login/signup.',
        });
      }
    }
  );

  fastify.post<{ Body: RefreshTokenBody }>(
    '/refresh-tokens',
    {
      schema: {
        tags: ['auth'],
        description: 'Refresh auth tokens(access + refresh)',
        body: refreshTokenJsonSchema,
        response: {
          200: refreshTokenResponseJsonSchema,
          400: {
            description: 'Invalid refresh token',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { refreshToken } = request.body;
        const result = await refreshAuthTokens(fastify, refreshToken, request);

        reply.send({
          message: 'Tokens refreshed successfully',
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
        });
      } catch (error) {
        fastify.log.error({
          error,
          msg: 'Error during token refresh',
        });

        if (
          error instanceof Error &&
          (error.message === 'Invalid token type' ||
            error.message === 'Invalid or expired refresh token' ||
            error.message === 'User not found')
        ) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: error.message,
          });
        }

        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred during token refresh.',
        });
      }
    }
  );
}
