import { FastifyInstance } from 'fastify';
import { DynamoDBPlayerMatchItem } from '../models/match.js';
import { DynamoDBUserItem, UserPublicProfile } from '../models/user.js';

const toPublicProfile = (user: DynamoDBUserItem): UserPublicProfile => {
  return {
    phoneNumber: user.phoneNumber,
    username: user.username,
    emailAddress: user.emailAddress,
    experiencePoints: user.experiencePoints,
    stats: user.stats,
    profile: user.profile,
  };
};

export const findUserByPhone = async (
  fastify: FastifyInstance,
  phoneNumber: string
): Promise<DynamoDBUserItem | undefined> => {
  return fastify.repositories.user.fetchUserByPhone(phoneNumber);
};

export const createUser = async (
  fastify: FastifyInstance,
  phoneNumber: string
): Promise<DynamoDBUserItem> => {
  try {
    return await fastify.repositories.user.persistNewUser(phoneNumber);
  } catch (error) {
    fastify.log.error({
      phoneNumber,
      error,
      msg: 'Error in createUser service',
    });
    throw error;
  }
};

export const updateUserLastLogin = async (
  fastify: FastifyInstance,
  user: DynamoDBUserItem
): Promise<void> => {
  try {
    await fastify.repositories.user.updateUserLastLoginTimestamp(user);
  } catch (error) {
    fastify.log.error({
      userId: user.userId,
      error,
      msg: 'Error in updateUserLastLogin service',
    });
    throw error;
  }
};

export const getUserProfile = async (
  fastify: FastifyInstance,
  userId: string
): Promise<UserPublicProfile | undefined> => {
  try {
    const user = await fastify.repositories.user.getUserById(userId);

    if (user) {
      const publicProfile = toPublicProfile(user);

      return publicProfile;
    } else {
      fastify.log.warn({
        userId,
        msg: 'Service: User not found in repository',
      });
      return undefined;
    }
  } catch (error) {
    fastify.log.error({
      userId,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
      msg: 'Error in getProfile service',
    });
    throw error;
  }
};

export const updateUsername = async (
  fastify: FastifyInstance,
  userId: string,
  username: string
): Promise<UserPublicProfile> => {
  try {
    const updatedUser = await fastify.repositories.user.updateUsername(
      userId,
      username
    );
    return toPublicProfile(updatedUser);
  } catch (error) {
    fastify.log.error({
      userId,
      username,
      error,
      msg: 'Error in changeUsername service',
    });
    throw error;
  }
};

export const getUserMatchHistory = async (
  fastify: FastifyInstance,
  userId: string
): Promise<DynamoDBPlayerMatchItem[]> => {
  try {
    return await fastify.repositories.user.getUserMatches(userId);
  } catch (error) {
    fastify.log.error({
      userId,
      error,
      msg: 'Error in getMatchHistory service',
    });
    throw error;
  }
};
