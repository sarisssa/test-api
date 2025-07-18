import { FastifyInstance } from 'fastify';
import { createUser, findUserByPhone, updateUserLastLogin } from './user.js';

const formatPhoneNumber = (phoneNumber: string): string => {
  if (!phoneNumber.startsWith('+')) {
    return '+1' + phoneNumber.replace(/\D/g, '');
  }
  return phoneNumber;
};

export const sendOtp = async (
  fastify: FastifyInstance,
  phoneNumber: string
) => {
  phoneNumber = formatPhoneNumber(phoneNumber);

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
};

export const verifyOtp = async (
  fastify: FastifyInstance,
  phoneNumber: string,
  code: string
) => {
  phoneNumber = formatPhoneNumber(phoneNumber);

  const verification = await fastify.twilio.verify.v2
    .services(fastify.config.TWILIO_VERIFY_SERVICE_SID)
    .verificationChecks.create({
      to: phoneNumber,
      code,
    });

  if (verification.status !== 'approved') {
    throw new Error('Invalid OTP code');
  }

  fastify.log.info({
    verificationSid: verification.sid,
    phoneNumber,
    msg: 'OTP verified successfully',
  });

  let user = await findUserByPhone(fastify, phoneNumber);
  const isNewUser = !user;

  if (!user) {
    user = await createUser(fastify, phoneNumber);
  } else {
    await updateUserLastLogin(fastify, user);
  }

  const token = fastify.jwt.sign({
    userId: user.userId,
    phoneNumber: user.phoneNumber,
  });

  return {
    isNewUser,
    token,
    user: {
      userId: user.userId,
      phoneNumber: user.phoneNumber,
      username: user.username,
      stats: user.stats,
      profile: user.profile,
    },
  };
};
