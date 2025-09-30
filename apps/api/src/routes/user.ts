import { FastifyInstance } from 'fastify';
import {
  getUserMatchHistory,
  getUserProfile,
  updateUsername,
  uploadProfilePicture,
} from '../services/user.js';
import {
  UpdateUsernameBody,
  updateUsernameJsonSchema,
  UploadRouteParams,
} from '../types/user.js';

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

  fastify.put<{ Params: UploadRouteParams }>(
    '/:userId/profile-picture',
    async (request, reply) => {
      const { userId } = request.params;

      try {
        const data = await request.file();

        if (!data) {
          return reply.status(400).send({ error: 'No file uploaded.' });
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(data.mimetype)) {
          return reply.status(400).send({
            error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.',
          });
        }

        const buffer = await data.toBuffer();

        const result = await uploadProfilePicture(fastify, {
          userId,
          fileBuffer: buffer,
          mimetype: data.mimetype,
        });

        return reply.send({
          message: 'Profile picture updated successfully',
          profilePictureUrl: result.profilePictureUrl,
          user: result.user,
        });
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
          userId: userId,
          msg: 'Error updating profile picture for user ' + userId,
        });

        if (error instanceof Error && error.message === 'User not found') {
          return reply.status(404).send({ error: 'User not found' });
        }

        if (
          error instanceof Error &&
          (error.message === 'S3_BUCKET_NAME not configured' ||
            error.message === 'AWS_REGION not configured')
        ) {
          return reply.status(500).send({ error: error.message });
        }

        return reply.status(500).send({
          error: 'Internal server error.',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
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
