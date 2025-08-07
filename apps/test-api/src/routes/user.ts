import { FastifyInstance } from 'fastify';
import {
  getUserMatchHistory,
  getUserProfile,
  updateUsername,
} from '../services/user.js';
import { UpdateUsernameBody, updateUsernameJsonSchema } from '../types/user.js';

interface UserRequest {
  userId: string;
}

//TODO: Replace with JWT
export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    try {
      const { userId } = request.query as { userId?: string };

      if (!userId) {
        fastify.log.warn({
          query: request.query,
          msg: 'Missing userId in query parameters',
        });
        return reply
          .status(400)
          .send({ error: 'userId query parameter is required' });
      }
      const userProfile = await getUserProfile(fastify, userId);

      if (!userProfile) {
        fastify.log.warn({ userId, msg: 'User profile not found' });
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send(userProfile);
    } catch (error) {
      fastify.log.error({
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
              }
            : error,
        query: request.query,
        msg: 'Error getting user profile',
      });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.put<{ Body: UpdateUsernameBody }>(
    '/username',
    {
      schema: {
        body: updateUsernameJsonSchema,
      },
    },
    async (request, reply) => {
      try {
        const { userId, username } = request.body;

        if (
          !username ||
          typeof username !== 'string' ||
          username.trim().length === 0
        ) {
          return reply
            .status(400)
            .send({ error: 'Valid username is required' });
        }

        const updatedUser = await updateUsername(
          fastify,
          userId,
          username.trim()
        );

        return reply.send(updatedUser);
      } catch (error) {
        fastify.log.error({ error, msg: 'Error updating username' });

        if (error instanceof Error && error.message === 'User not found') {
          return reply.status(404).send({ error: 'User not found' });
        }

        if (
          error instanceof Error &&
          error.message === 'Username already taken'
        ) {
          return reply.status(409).send({ error: 'Username already taken' });
        }

        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  fastify.put<{ Body: UserRequest }>(
    '/profileImage',
    async (request, reply) => {
      // TODO: Generate presigned url and upload image to S3
      return reply
        .status(501)
        .send({ error: 'Profile image update not implemented yet' });
    }
  );

  fastify.get('/matches', async (request, reply) => {
    try {
      const { userId } = request.query as { userId?: string };

      if (!userId) {
        return reply
          .status(400)
          .send({ error: 'userId query parameter is required' });
      }

      const matches = await getUserMatchHistory(fastify, userId);

      return reply.send({
        matches,
        total: matches.length,
      });
    } catch (error) {
      fastify.log.error({ error, msg: 'Error getting user matches' });

      if (error instanceof Error && error.message === 'User not found') {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
