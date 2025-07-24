import { FastifyInstance } from 'fastify';
import { formatPhoneNumber } from '../utils/phone-utils.js';
import { createUser, findUserByPhone, updateUserLastLogin } from './user.js';

export const sendOtp = async (
  fastify: FastifyInstance,
  phoneNumber: string
) => {
  phoneNumber = formatPhoneNumber(phoneNumber);

  try {
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
  } catch (error) {
    fastify.log.error({
      error,
      phoneNumber,
      msg: 'Failed to send OTP via Twilio',
    });

    throw new Error('Failed to send OTP. Please try again.');
  }
};

export const verifyOtp = async (
  fastify: FastifyInstance,
  phoneNumber: string,
  code: string
) => {
  phoneNumber = formatPhoneNumber(phoneNumber);

  try {
    const verification = await fastify.twilio.verify.v2
      .services(fastify.config.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: phoneNumber,
        code,
      });

    if (verification.status !== 'approved') {
      fastify.log.warn({
        verificationSid: verification.sid,
        phoneNumber,
        status: verification.status,
        msg: 'OTP verification failed: Invalid code',
      });
      throw new Error('Invalid OTP code');
    }

    fastify.log.info({
      verificationSid: verification.sid,
      phoneNumber,
      msg: 'OTP verified successfully by Twilio',
    });

    let user = await findUserByPhone(fastify, phoneNumber);
    const isNewUser = !user;

    if (!user) {
      user = await createUser(fastify, phoneNumber);
      fastify.log.info({
        userId: user.userId,
        phoneNumber,
        msg: 'New user created after OTP verification',
      });
    } else {
      await updateUserLastLogin(fastify, user);
      fastify.log.info({
        userId: user.userId,
        phoneNumber,
        msg: 'Existing user last login updated after OTP verification',
      });
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
  } catch (error) {
    fastify.log.error({
      error,
      phoneNumber,
      msg: 'Failed during OTP verification or user processing',
    });

    if (error instanceof Error && error.message === 'Invalid OTP code') {
      throw error;
    }
    throw new Error('An error occurred during verification. Please try again.');
  }
};
