import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createChallenge, getUserChallenges } from '../services/challenge.js';
import { getUserFriends, getUserRequests } from '../services/friend.js';
import { generateInviteLink, getUserInvites } from '../services/invite.js';
import {
  isChallengeExpired,
  validateChallengeCreation,
} from '../utils/challenge-utils.js';

import { getUserPerks } from '../services/perk.js';
import {
  getUserMatchHistory,
  getUserProfile,
  updateUsername,
  uploadProfilePicture,
} from '../services/user.js';
import {
  challengesResponseJsonSchema,
  CreateChallengeBody,
  createChallengeJsonSchema,
  createChallengeResponseJsonSchema,
  UpdateChallengeParams,
  updateChallengeParamsJsonSchema,
} from '../types/challenge.js';
import {
  CreateFriendRequestBody,
  createFriendRequestJsonSchema,
  UpdateFriendRequestParams,
  updateFriendRequestParamsJsonSchema,
} from '../types/friend.js';
import { createInviteResponseJsonSchema } from '../types/invite.js';
import { userPerksResponseJsonSchema } from '../types/perk.js';
import {
  friendRequestsResponseJsonSchema,
  friendsResponseJsonSchema,
  invitesResponseSchema,
  matchesResponseJsonSchema,
  profilePictureResponseSchema,
  UpdateUsernameBody,
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
          stats: {
            total: userPerks.length,
          },
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
          stats: { total: matches.length },
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
        description: 'Get user referral invites',
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
        return reply.send({ friends, stats: { total: friends.length } });
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

  fastify.get(
    '/friends/requests',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Get all user friend requests',
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
      try {
        const requests = await getUserRequests(fastify, request.user.userId);
        return reply.send({
          requests,
          stats: {
            total: requests.length,
            incoming: requests.filter(r => r.direction === 'incoming').length,
            outgoing: requests.filter(r => r.direction === 'outgoing').length,
          },
        });
      } catch (error) {
        fastify.log.error({
          error,
          userId: request.user.userId,
          msg: 'Error in GET /friends/requests endpoint',
        });
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to fetch friend requests',
        });
      }
    }
  );

  fastify.post<{ Body: CreateFriendRequestBody }>(
    '/friends/requests',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Send a friend request',
        body: createFriendRequestJsonSchema,
        response: {
          201: {
            description: 'Friend request sent successfully',
            type: 'object',
            properties: {
              requestId: { type: 'string' },
              message: { type: 'string' },
            },
          },
          400: {
            description: 'Invalid request',
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
    async (request, reply) => {
      const { receiverId } = request.body;

      if (request.user.userId === receiverId) {
        return reply.status(400).send({
          error: 'Cannot send friend request to yourself',
        });
      }

      try {
        const friendRequest =
          await fastify.repositories.friend.createFriendRequest(
            request.user.userId,
            receiverId
          );

        return reply.status(201).send({
          requestId: friendRequest.requestId,
          message: 'Friend request sent successfully',
        });
      } catch (error) {
        fastify.log.error({
          error,
          senderId: request.user.userId,
          receiverId,
          msg: 'Error in POST /requests endpoint',
        });
        return reply.status(500).send({
          error: 'Failed to send friend request',
        });
      }
    }
  );

  fastify.patch<{ Params: UpdateFriendRequestParams }>(
    '/friends/requests/:requestId',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Accept or reject a friend request',
        params: updateFriendRequestParamsJsonSchema,
        body: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['accepted', 'rejected'],
            },
          },
          required: ['status'],
          additionalProperties: false,
        },
        response: {
          200: {
            description: 'Friend request processed successfully',
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
          403: {
            description: 'Not authorized to respond to this request',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          404: {
            description: 'Friend request not found',
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
    async (request, reply) => {
      const { requestId } = request.params;
      const { status } = request.body as { status: 'accepted' | 'rejected' };

      try {
        const friendRequest =
          await fastify.repositories.friend.getFriendRequest(requestId);

        if (!friendRequest) {
          return reply.status(404).send({
            error: 'Friend request not found',
          });
        }

        if (friendRequest.receiverId !== request.user.userId) {
          return reply.status(403).send({
            error: 'Not authorized to respond to this request',
          });
        }

        if (status === 'accepted') {
          await fastify.repositories.friend.createFriendship(
            friendRequest.senderId,
            friendRequest.receiverId
          );
        }

        await fastify.repositories.friend.deleteFriendRequest(requestId);

        return reply.status(200).send({
          message:
            status === 'accepted'
              ? 'Friend request accepted'
              : 'Friend request rejected',
        });
      } catch (error) {
        fastify.log.error({
          error,
          requestId,
          userId: request.user.userId,
          status,
          msg: 'Error in PATCH /requests/:requestId endpoint',
        });
        return reply.status(500).send({
          error: 'Failed to process friend request',
        });
      }
    }
  );

  fastify.delete<{ Params: { friendId: string } }>(
    '/friends/:friendId',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Remove a friend',
        params: {
          type: 'object',
          properties: {
            friendId: {
              type: 'string',
              pattern:
                '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            },
          },
          required: ['friendId'],
          additionalProperties: false,
        },
        response: {
          200: {
            description: 'Friend removed successfully',
            type: 'object',
            properties: {
              message: { type: 'string' },
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
    async (request, reply) => {
      const { friendId } = request.params;

      try {
        await fastify.repositories.friend.deleteFriendship(
          request.user.userId,
          friendId
        );
        return reply.status(200).send({
          message: 'Friend removed successfully',
        });
      } catch (error) {
        fastify.log.error({
          error,
          userId: request.user.userId,
          friendId,
          msg: 'Error in DELETE /friends/:friendId endpoint',
        });
        return reply.status(500).send({
          error: 'Failed to remove friend',
        });
      }
    }
  );

  fastify.get(
    '/challenges',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Get all user challenges (incoming and outgoing)',
        response: {
          200: challengesResponseJsonSchema,
          500: {
            description: 'Internal server error',
            $ref: 'ErrorResponse#',
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const challenges = await getUserChallenges(
          fastify,
          request.user.userId
        );
        return reply.send({
          challenges,
          stats: {
            total: challenges.length,
            outgoing: challenges.filter(c => c.direction === 'outgoing').length,
            incoming: challenges.filter(c => c.direction === 'incoming').length,
          },
        });
      } catch (error) {
        fastify.log.error({
          error,
          userId: request.user.userId,
          msg: 'Error in GET /user/challenges endpoint',
        });
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to fetch challenges',
        });
      }
    }
  );

  fastify.post<{ Body: CreateChallengeBody }>(
    '/challenges',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description: 'Issue a challenge to another player',
        body: createChallengeJsonSchema,
        response: {
          201: createChallengeResponseJsonSchema,
          400: {
            description: 'Invalid request',
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
    async (request, reply) => {
      const { challengedId, duration, amount, category } = request.body;

      if (request.user.userId === challengedId) {
        return reply.status(400).send({
          error: 'Cannot challenge yourself',
        });
      }

      const validationError = validateChallengeCreation(category, duration);
      if (validationError) {
        return reply.status(400).send({
          error: validationError,
        });
      }

      try {
        const challenge = await createChallenge(
          fastify,
          request.user.userId,
          challengedId,
          duration,
          amount,
          category
        );

        return reply.status(201).send({
          challengeId: challenge.challengeId,
          message: 'Challenge issued successfully',
          challenge,
        });
      } catch (error) {
        fastify.log.error({
          error,
          challengerId: request.user.userId,
          challengedId,
          msg: 'Error in POST /user/challenges endpoint',
        });
        return reply.status(500).send({
          error: 'Failed to issue challenge',
        });
      }
    }
  );

  fastify.patch<{ Params: UpdateChallengeParams }>(
    '/challenges/:challengeId',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['user'],
        description:
          'Update challenge status - Challenged player can accept/reject, Challenger can cancel',
        params: updateChallengeParamsJsonSchema,
        body: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['accepted', 'rejected', 'cancelled'],
            },
          },
          required: ['status'],
          additionalProperties: false,
        },
        response: {
          200: {
            description: 'Challenge processed successfully',
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
          400: {
            description: 'Invalid request',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          403: {
            description: 'Not authorized to respond to this challenge',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          404: {
            description: 'Challenge not found',
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
    async (request, reply) => {
      const { challengeId } = request.params;
      const { status } = request.body as {
        status: 'accepted' | 'rejected' | 'cancelled';
      };

      try {
        const challenge =
          await fastify.repositories.challenge.getChallenge(challengeId);

        if (!challenge) {
          return reply.status(404).send({
            error: 'Challenge not found',
          });
        }

        if (challenge.status !== 'PENDING') {
          return reply.status(400).send({
            error: 'Challenge has already been processed',
          });
        }

        const isChallenged = challenge.challengedId === request.user.userId;
        const isChallenger = challenge.challengerId === request.user.userId;

        if (status === 'cancelled') {
          if (!isChallenger) {
            return reply.status(403).send({
              error: 'Only the challenger can cancel this challenge',
            });
          }
        } else {
          if (!isChallenged) {
            return reply.status(403).send({
              error: 'Only the challenged player can accept or reject',
            });
          }

          if (isChallengeExpired(challenge.expiresAt)) {
            await fastify.repositories.challenge.updateChallengeStatus(
              challengeId,
              'EXPIRED'
            );
            return reply.status(400).send({
              error: 'Challenge has expired and can no longer be accepted',
            });
          }
        }

        await fastify.repositories.challenge.updateChallengeStatus(
          challengeId,
          status.toUpperCase() as 'ACCEPTED' | 'REJECTED' | 'CANCELLED'
        );

        const messages = {
          accepted: 'Challenge accepted',
          rejected: 'Challenge rejected',
          cancelled: 'Challenge cancelled',
        };

        return reply.status(200).send({
          message: messages[status],
        });
      } catch (error) {
        fastify.log.error({
          error,
          challengeId,
          userId: request.user.userId,
          status,
          msg: 'Error in PATCH /user/challenges/:challengeId endpoint',
        });
        return reply.status(500).send({
          error: 'Failed to process challenge',
        });
      }
    }
  );
}
