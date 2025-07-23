import { FastifyInstance } from 'fastify';
import { DynamoDBUserItem } from '../models/user.js';

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
