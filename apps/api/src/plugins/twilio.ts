import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import twilio, { Twilio } from 'twilio';

declare module 'fastify' {
  interface FastifyInstance {
    twilio: Twilio;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const client = twilio(
    fastify.config.TWILIO_ACCOUNT_SID,
    fastify.config.TWILIO_AUTH_TOKEN
  );

  fastify.decorate('twilio', client);
});
