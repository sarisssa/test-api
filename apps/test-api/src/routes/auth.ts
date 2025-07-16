import { FastifyInstance } from 'fastify';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/send-otp', async () => {
    return { status: 'OTP endpoint' };
  });

  fastify.post('/logout', async () => {
    return { status: 'Logout endpoint' };
  });
}
