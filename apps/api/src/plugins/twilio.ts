import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import twilio, { Twilio } from 'twilio';

declare module 'fastify' {
  interface FastifyInstance {
    twilio: Twilio;
  }
}

const buildTwilioStub = (fastify: FastifyInstance): Twilio => {
  const createResponse = (status: 'pending' | 'approved') => ({
    sid: `stub-${Date.now()}`,
    status,
  });

  return {
    verify: {
      v2: {
        services: (serviceSid: string) => {
          fastify.log.debug(
            { serviceSid },
            'Using Twilio stub service (local testing)'
          );

          return {
            verifications: {
              create: async ({
                to,
                channel,
              }: {
                to: string;
                channel: string;
              }) => {
                fastify.log.info({
                  to,
                  channel,
                  msg: 'Stub Twilio verification create invoked',
                });
                return {
                  ...createResponse('pending'),
                  to,
                  channel,
                };
              },
            },
            verificationChecks: {
              create: async ({ to, code }: { to: string; code: string }) => {
                fastify.log.info({
                  to,
                  code,
                  msg: 'Stub Twilio verification check invoked',
                });

                const status =
                  code === '000000' ? 'pending' : ('approved' as const);

                return {
                  ...createResponse(status),
                  to,
                  valid: status === 'approved',
                };
              },
            },
          };
        },
      },
    },
  } as unknown as Twilio;
};

export default fp(async (fastify: FastifyInstance) => {
  const useStub =
    (fastify.config.USE_TWILIO_STUB ?? 'false').toLowerCase() === 'true';

  const client = useStub
    ? buildTwilioStub(fastify)
    : twilio(
        fastify.config.TWILIO_ACCOUNT_SID,
        fastify.config.TWILIO_AUTH_TOKEN
      );

  fastify.decorate('twilio', client);
});
