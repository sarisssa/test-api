import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getUserFriends, getUserRequests } from '../services/friend.js';
import { generateInviteLink, getUserInvites } from '../services/invite.js';

import { getUserPerks } from '../services/perk.js';
import {
  getUserMatchHistory,
  getUserProfile,
  updateUsername,
  uploadProfilePicture,
} from '../services/user.js';
import { createInviteResponseJsonSchema } from '../types/invite.js';
import { userPerksResponseJsonSchema } from '../types/perk.js';
import {
  GetFriendRequestsQuery,
  UpdateUsernameBody,
  friendRequestsResponseJsonSchema,
  friendsResponseJsonSchema,
  getFriendRequestsQueryJsonSchema,
  invitesResponseSchema,
  matchesResponseJsonSchema,
  profilePictureResponseSchema,
  updateUsernameJsonSchema,
  updateUsernameResponseJsonSchema,
  userProfileResponseSchema,
} from '../types/user.js';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Headers: { authorization: string };
  }>(
    '/',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Get user profile',
        response: {
          200: userProfileResponseSchema,
          404: {
            description: 'User not found',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const userProfile = await getUserProfile(fastify, request.user.userId);

        if (!userProfile) {
          fastify.log.warn({
            userId: request.user.userId,
            msg: 'User profile not found',
          });
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'User not found',
          });
        }

        const response = userProfile;

        return reply.send(response);
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
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Internal server error',
        });
      }
    }
  );

  fastify.put<{ Body: UpdateUsernameBody }>(
    '/username',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Update user username',
        body: updateUsernameJsonSchema,
        response: {
          200: updateUsernameResponseJsonSchema,
          404: {
            description: 'User not found',
            $ref: 'ErrorResponse#',
          },
          409: {
            description: 'Username already taken',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
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

        return reply.send({
          message: 'Username updated successfully',
          newUsername: updatedUser.username,
        });
      } catch (error) {
        fastify.log.error({ error, msg: 'Error updating username' });

        if (error instanceof Error && error.message === 'User not found') {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'User not found',
          });
        }

        if (
          error instanceof Error &&
          error.message === 'Username already taken'
        ) {
          return reply.status(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'Username already taken',
          });
        }

        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Internal server error',
        });
      }
    }
  );

  fastify.put<{
    Headers: { authorization: string };
  }>(
    '/profile-picture',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Upload user profile picture',
        consumes: ['multipart/form-data'],
        response: {
          200: profilePictureResponseSchema,
          400: {
            description: 'Invalid request',
            $ref: 'ErrorResponse#',
          },
          404: {
            description: 'User not found',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },

    async (request, reply) => {
      try {
        const file = await request.file();

        if (!file) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'No file uploaded',
          });
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.',
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
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'User not found',
          });
        }

        if (
          error instanceof Error &&
          (error.message === 'S3_BUCKET_NAME not configured' ||
            error.message === 'AWS_REGION not configured')
        ) {
          return reply.status(500).send({
            statusCode: 500,
            error: 'Internal Server Error',
            message: error.message,
          });
        }

        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message:
            'Internal server error: ' +
            (error instanceof Error ? error.message : 'Unknown error'),
        });
      }
    }
  );

  fastify.get(
    '/perks',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: "Get user's purchased perks",
        response: {
          200: userPerksResponseJsonSchema,
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const userPerks = await getUserPerks(fastify, request.user.userId);

        return {
          perks: userPerks,
          count: userPerks.length,
        };
      } catch (error) {
        fastify.log.error({
          error,
          userId: request.user.userId,
          msg: 'Error in GET /perks/my-perks endpoint',
        });
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to fetch user perks',
        });
      }
    }
  );

  fastify.get(
    '/matches',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Get user match history',
        response: {
          200: matchesResponseJsonSchema,
          404: {
            description: 'User not found',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
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
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'User not found',
          });
        }

        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Internal server error',
        });
      }
    }
  );

  fastify.get(
    '/invites',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Get user invites',
        response: {
          200: invitesResponseSchema,
          404: {
            description: 'User not found',
            $ref: 'ErrorResponse#',
          },
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const invites = await getUserInvites(fastify, request.user.userId);

        const invitesWithStats = invites.map(invite => ({
          status: invite.status,
          createdAt: invite.createdAt,
          inviteUrl: `https://wage.app/invite/${invite.inviteCode}`,
        }));

        const stats = {
          total: invites.length,
          sent: invites.filter(i => i.status === 'SENT').length,
          accepted: invites.filter(i => i.status === 'ACCEPTED').length,
        };

        return reply.send({
          invites: invitesWithStats,
          stats,
        });
      } catch (error) {
        fastify.log.error({
          error,
          userId: request.user.userId,
          msg: 'Error in GET /user/invites endpoint',
        });

        if (error instanceof Error && error.message === 'User not found') {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'User not found',
          });
        }

        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to fetch user invites',
        });
      }
    }
  );

  fastify.post(
    '/invites',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Generate a new invite link',
        response: {
          201: createInviteResponseJsonSchema,
          404: {
            description: 'Sender not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: {
            description: 'Internal server error',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await generateInviteLink(fastify, request.user.userId);

        return reply.status(201).send({
          inviteUrl: result.inviteUrl,
          createdAt: result.invite.createdAt,
        });
      } catch (error) {
        fastify.log.error({
          error,
          senderId: request.user.userId,
          msg: 'Error in POST /invites endpoint',
        });

        if (error instanceof Error && error.message === 'Sender not found') {
          return reply.status(404).send({
            error: 'Sender not found',
          });
        }

        return reply.status(500).send({
          error: 'Failed to generate invite link',
        });
      }
    }
  );

  fastify.get(
    '/friends',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Get user friends list',
        response: {
          200: friendsResponseJsonSchema,
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const friends = await getUserFriends(fastify, request.user.userId);
        return reply.send({ friends, total: friends.length });
      } catch (error) {
        fastify.log.error({
          error,
          userId: request.user.userId,
          msg: 'Error in GET /user/friends endpoint',
        });
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to fetch friends',
        });
      }
    }
  );

  fastify.get<{ Querystring: GetFriendRequestsQuery }>(
    '/requests',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user', 'friends'],
        description: 'Get user friend requests',
        querystring: getFriendRequestsQueryJsonSchema,
        response: {
          200: friendRequestsResponseJsonSchema,
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      //Default to incoming requests
      const { type = 'incoming' } = request.query;

      try {
        const requests = await getUserRequests(
          fastify,
          request.user.userId,
          type
        );
        return reply.send({ requests, total: requests.length });
      } catch (error) {
        fastify.log.error({
          error,
          userId: request.user.userId,
          type,
          msg: 'Error in GET /user/requests endpoint',
        });
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to fetch friend requests',
        });
      }
    }
  );
}
