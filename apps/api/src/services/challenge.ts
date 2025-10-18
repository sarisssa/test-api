import { FastifyInstance } from 'fastify';
import { ChallengeResponse } from '../models/challenge.js';

export const createChallenge = async (
  fastify: FastifyInstance,
  challengerId: string,
  challengedId: string,
  duration: 30 | 60 | 120 | 240,
  amount: 5 | 10 | 15 | 25,
  category: 'stock' | 'crypto' | 'commodities'
): Promise<ChallengeResponse> => {
  try {
    const challenge = await fastify.repositories.challenge.createChallenge(
      challengerId,
      challengedId,
      duration,
      amount,
      category
    );

    const [challenger, challenged] = await Promise.all([
      fastify.repositories.user.getUserById(challengerId),
      fastify.repositories.user.getUserById(challengedId),
    ]);

    if (!challenger || !challenged) {
      throw new Error('User not found');
    }

    return {
      challengeId: challenge.challengeId,
      challenger: {
        userId: challenger.userId,
        username: challenger.username,
        profilePictureUrl: challenger.profilePictureUrl,
      },
      challenged: {
        userId: challenged.userId,
        username: challenged.username,
        profilePictureUrl: challenged.profilePictureUrl,
      },
      status: challenge.status,
      duration: challenge.duration,
      amount: challenge.amount,
      category: challenge.category,
      createdAt: challenge.createdAt,
      direction: 'outgoing',
      expiresAt: challenge.expiresAt,
    };
  } catch (error) {
    fastify.log.error({
      error,
      challengerId,
      challengedId,
      msg: 'Error in createChallenge service',
    });
    throw error;
  }
};

export const getUserChallenges = async (
  fastify: FastifyInstance,
  userId: string
): Promise<ChallengeResponse[]> => {
  try {
    const challenges =
      await fastify.repositories.challenge.getUserChallenges(userId);

    const enrichedChallenges = await Promise.all(
      challenges.map(async challenge => {
        // Determine direction based on whether user is challenger or challenged
        const isIncoming = challenge.challengedId === userId;

        const [challenger, challenged] = await Promise.all([
          fastify.repositories.user.getUserById(challenge.challengerId),
          fastify.repositories.user.getUserById(challenge.challengedId),
        ]);

        if (!challenger || !challenged) return null;

        return {
          challengeId: challenge.challengeId,
          challenger: {
            userId: challenger.userId,
            username: challenger.username,
            profilePictureUrl: challenger.profilePictureUrl,
          },
          challenged: {
            userId: challenged.userId,
            username: challenged.username,
            profilePictureUrl: challenged.profilePictureUrl,
          },
          status: challenge.status,
          duration: challenge.duration,
          amount: challenge.amount,
          category: challenge.category,
          createdAt: challenge.createdAt,
          direction: isIncoming ? ('incoming' as const) : ('outgoing' as const),
          expiresAt: challenge.expiresAt,
        };
      })
    );

    return enrichedChallenges.filter(
      (c): c is NonNullable<(typeof enrichedChallenges)[number]> => c !== null
    );
  } catch (error) {
    fastify.log.error({
      error,
      userId,
      msg: 'Error in getUserChallenges service',
    });
    throw error;
  }
};
