import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import twilio from 'twilio';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBUserItem } from '../models/user';
import { SendOtpBody, VerifyOtpBody } from '../types/auth';

export default async function authRoutes(fastify: FastifyInstance) {
  const twilioClient = twilio(
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
      const verification = await twilioClient.verify.v2
        .services(fastify.config.TWILIO_VERIFY_SERVICE_SID)
        .verifications.create({
          channel: 'sms',
          to: phoneNumber,
        });

      fastify.log.info({
        verificationSid: verification.sid,
        phoneNumber,
        status: verification.status, // Log the status from Twilio
        msg: 'OTP send request processed by Twilio',
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
        const verificationCheck = await twilioClient.verify.v2
          .services(fastify.config.TWILIO_VERIFY_SERVICE_SID)
          .verificationChecks.create({
            code,
            to: phoneNumber,
          });

        if (verificationCheck.status !== 'approved') {
          fastify.log.warn({
            verificationSid: verificationCheck.sid,
            phoneNumber,
            status: verificationCheck.status,
            msg: 'OTP verification failed: Invalid or expired code',
          });
          return reply.status(400).send({ message: 'Invalid or expired OTP.' });
        }

        fastify.log.info({
          verificationSid: verificationCheck.sid,
          phoneNumber,
          msg: 'OTP verified successfully',
        });

        const userPK = `USER#${phoneNumber}`;
        const userSK = 'PROFILE';

        const userGetResult = await fastify.dynamodb.send(
          new GetCommand({
            TableName: 'WageTable',
            Key: {
              PK: userPK,
              SK: userSK,
            },
          })
        );
        let user = userGetResult.Item as DynamoDBUserItem | undefined;
        let isNewUser = false;

        if (!user) {
          // Create new user
          isNewUser = true;
          const newUserId = uuidv4();
          user = {
            PK: `USER#${phoneNumber}`,
            SK: 'PROFILE',
            EntityType: 'User',
            userId: newUserId,
            phoneNumber,
            createdAt: new Date().toISOString(),
            lastLoggedIn: new Date().toISOString(),
            stats: {
              totalMatches: 0,
              wins: 0,
              losses: 0,
              currentStreak: 0,
              longestStreak: 0,
              rank: 'Bronze',
              level: 1,
            },
          };

          await fastify.dynamodb.send(
            new PutCommand({
              TableName: 'WageTable',
              Item: user,
            })
          );

          fastify.log.info({
            userId: newUserId,
            phoneNumber,
            msg: 'New user created',
          });
        } else {
          // Update last login time for existing user
          await fastify.dynamodb.send(
            new UpdateCommand({
              TableName: 'WageTable',
              Key: {
                PK: userPK,
                SK: userSK,
              },
              UpdateExpression: 'SET lastLoggedIn = :lastLoggedIn',
              ExpressionAttributeValues: {
                ':lastLoggedIn': new Date().toISOString(),
              },
              ReturnValues: 'UPDATED_NEW', // Optional: get updated attributes back
            })
          );
          fastify.log.info({
            userId: user.userId,
            phoneNumber,
            msg: 'Existing user lastLoggedIn updated in DynamoDB',
          });
        }

        const token = fastify.jwt.sign({
          userId: user.userId,
          phoneNumber: user.phoneNumber,
        });

        return reply.send({
          message: isNewUser
            ? 'Account created successfully'
            : 'Logged in successfully',
          token,
          user: {
            userId: user.userId,
            phoneNumber: user.phoneNumber,
            username: user.username,
            stats: user.stats,
            profile: user.profile,
          },
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
