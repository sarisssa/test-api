import { FastifyInstance } from 'fastify';
import { sendOtp, verifyOtp } from '../services/auth.js';
import {
  SendOtpBody,
  sendOtpJsonSchema,
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
}
