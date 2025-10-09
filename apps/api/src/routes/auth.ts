import { FastifyInstance } from 'fastify';
import { sendOtp, verifyOtp } from '../services/auth.js';
import {
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
        description: 'Verify OTP code and get authentication tokens',
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
}
