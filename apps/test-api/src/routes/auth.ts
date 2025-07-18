import { FastifyInstance } from 'fastify';
import twilio from 'twilio';
import { SendOtpBody, VerifyOtpBody } from '../types/auth';

export default async function authRoutes(fastify: FastifyInstance) {
  const client = twilio(
    fastify.config.TWILIO_ACCOUNT_SID,
    fastify.config.TWILIO_AUTH_TOKEN
  );

  fastify.post<{ Body: SendOtpBody }>('/send-otp', async (request, reply) => {
    let { phoneNumber } = request.body;

    //Server side safegaurd to ensure phone number is in E.164 format
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+1' + phoneNumber.replace(/\D/g, '');
    }

    try {
      const verification = await client.verify.v2
        .services(fastify.config.TWILIO_VERIFY_SERVICE_SID)
        .verifications.create({
          channel: 'sms',
          to: phoneNumber,
        });

      fastify.log.info({
        verificationSid: verification.sid,
        phoneNumber,
        msg: 'OTP sent successfully',
      });

      reply.status(200).send({ message: 'OTP sent successfully' });
    } catch (error) {
      fastify.log.error({ error, msg: 'Error sending OTP' });
      reply.status(500).send({
        message: 'Failed to send OTP',
        error: (error as Error).message,
      });
    }
  });

  fastify.post<{ Body: VerifyOtpBody }>(
    '/verify-otp',
    async (request, reply) => {
      const { code } = request.body;
      let { phoneNumber } = request.body;

      if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+1' + phoneNumber.replace(/\D/g, '');
      }

      try {
        const verificationCheck = await client.verify.v2
          .services(fastify.config.TWILIO_VERIFY_SERVICE_SID)
          .verificationChecks.create({
            code,
            to: phoneNumber,
          });

        fastify.log.info({
          verificationSid: verificationCheck.sid,
          phoneNumber,
          msg: 'OTP verified successfully',
        });

        reply.status(200).send({ message: 'OTP verified successfully' });
      } catch (error) {
        fastify.log.error({ error, msg: 'Error sending OTP' });
        reply.status(500).send({
          message: 'Failed to verify OTP',
          error: (error as Error).message,
        });
      }
    }
  );
}
