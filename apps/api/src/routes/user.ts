import { FastifyInstance } from 'fastify';
import { getUserFriends, getUserRequests } from '../services/friend.js';
import { getUserInvites } from '../services/invite.js';
import {
  getUserMatchHistory,
  getUserProfile,
  updateUsername,
  uploadProfilePicture,
} from '../services/user.js';
import {
  GetFriendRequestsQuery,
  UpdateUsernameBody,
  friendsResponseJsonSchema,
  getFriendRequestsQueryJsonSchema,
  matchesResponseJsonSchema,
  updateUsernameJsonSchema,
} from '../types/user.js';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    try {
      const userProfile = await getUserProfile(fastify, request.user.userId);

      if (!userProfile) {
        fastify.log.warn({
          userId: request.user.userId,
          msg: 'User profile not found',
        });
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
        const { username } = request.body;
        const updatedUser = await updateUsername(
          fastify,
          request.user.userId,
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

  fastify.put(
    '/profile-picture',

    async (request, reply) => {
      try {
        const file = await request.file();

        if (!file) {
          return reply.status(400).send({ error: 'No file uploaded.' });
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
          return reply.status(400).send({
            error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.',
          });
        }

        const buffer = await file.toBuffer();

        const result = await uploadProfilePicture(fastify, {
          userId: request.user.userId,
          fileBuffer: buffer,
          mimetype: file.mimetype,
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
          userId: request.user.userId,
          msg: 'Error updating profile picture',
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

  fastify.get(
    '/matches',
    {
      schema: {
        response: {
          200: matchesResponseJsonSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const matches = await getUserMatchHistory(fastify, request.user.userId);

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
    }
  );

  fastify.get('/invites', async (request, reply) => {
    try {
      const invites = await getUserInvites(fastify, request.user.userId);

      const invitesWithStats = invites.map(invite => ({
        inviteCode: invite.inviteCode,
        status: invite.status,
        createdAt: invite.createdAt,
        inviteUrl: `https://wage.app/invite/${invite.inviteCode}`,
      }));

      const stats = {
        total: invites.length,
        sent: invites.filter(i => i.status === 'SENT').length,
        accepted: invites.filter(i => i.status === 'ACCEPTED').length,
      };

      return {
        invites: invitesWithStats,
        stats,
      };
    } catch (error) {
      fastify.log.error({
        error,
        userId: request.user.userId,
        msg: 'Error in GET /user/invites endpoint',
      });

      if (error instanceof Error && error.message === 'User not found') {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.status(500).send({ error: 'Failed to fetch user invites' });
    }
  });

  fastify.get(
    '/friends',
    {
      schema: {
        response: {
          200: friendsResponseJsonSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const friends = await getUserFriends(fastify, request.user.userId);
        return reply.send(friends);
      } catch (error) {
        fastify.log.error({
          error,
          userId: request.user.userId,
          msg: 'Error in GET /user/friends endpoint',
        });
        return reply.status(500).send({
          error: 'Failed to fetch friends',
        });
      }
    }
  );

  fastify.get<{ Querystring: GetFriendRequestsQuery }>(
    '/requests',
    {
      schema: {
        querystring: getFriendRequestsQueryJsonSchema,
      },
    },
    async (request, reply) => {
      const { type = 'incoming' } = request.query;

      try {
        const requests = await getUserRequests(
          fastify,
          request.user.userId,
          type
        );
        return reply.send(requests);
      } catch (error) {
        fastify.log.error({
          error,
          userId: request.user.userId,
          type,
          msg: 'Error in GET /user/requests endpoint',
        });
        return reply.status(500).send({
          error: 'Failed to fetch friend requests',
        });
      }
    }
  );
}
