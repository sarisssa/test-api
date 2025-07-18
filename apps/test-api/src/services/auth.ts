import { FastifyInstance } from 'fastify';
import twilio from 'twilio';
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
  const client = twilio(
    fastify.config.TWILIO_ACCOUNT_SID,
    fastify.config.TWILIO_AUTH_TOKEN
  );

  phoneNumber = formatPhoneNumber(phoneNumber);

  const verification = await client.verify.v2
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
  const client = twilio(
    fastify.config.TWILIO_ACCOUNT_SID,
    fastify.config.TWILIO_AUTH_TOKEN
  );

  phoneNumber = formatPhoneNumber(phoneNumber);

  const verification = await client.verify.v2
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

  // Find or create user
  let user = await findUserByPhone(fastify, phoneNumber);
  const isNewUser = !user;

  if (!user) {
    user = await createUser(fastify, phoneNumber);
  } else {
    await updateUserLastLogin(fastify, user);
  }

  // Generate JWT
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
