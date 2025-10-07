import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  generateInviteLink,
  processInviteAcceptance,
} from '../services/invite.js';
import {
  createInviteResponseJsonSchema,
  InviteCodeParams,
  inviteCodeParamsJsonSchema,
} from '../types/invite.js';

export default async function inviteRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      schema: {
        response: {
          201: createInviteResponseJsonSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await generateInviteLink(fastify, request.user.userId);

        return reply.status(201).send({
          success: true,
          inviteCode: result.inviteCode,
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

  fastify.get<{ Params: InviteCodeParams }>(
    '/:inviteCode',
    {
      schema: {
        params: inviteCodeParamsJsonSchema,
      },
    },
    async (request, reply) => {
      const { inviteCode } = request.params;

      try {
        const invite =
          await fastify.repositories.invite.getInviteByCode(inviteCode);

        if (!invite) {
          return reply.status(404).send({
            error: 'Invite not found',
          });
        }

        const sender = await fastify.repositories.user.getUserById(
          invite.senderId
        );

        return {
          inviteCode: invite.inviteCode,
          status: invite.status,
          createdAt: invite.createdAt,
          sender: {
            userId: sender?.userId,
            username: sender?.username,
            // Don't expose sensitive data
          },
        };
      } catch (error) {
        fastify.log.error({
          error,
          inviteCode,
          msg: 'Error in GET /invites/:inviteCode endpoint',
        });
        return reply.status(500).send({
          error: 'Failed to fetch invite details',
        });
      }
    }
  );

  fastify.post<{ Params: InviteCodeParams }>(
    '/:inviteCode/accept',
    {
      schema: {
        params: inviteCodeParamsJsonSchema,
      },
    },
    async (request, reply) => {
      const { inviteCode } = request.params;

      try {
        const result = await processInviteAcceptance(
          fastify,
          inviteCode,
          request.user.userId
        );

        if (result.success) {
          return reply.status(200).send({
            success: true,
            message: result.message,
          });
        } else {
          return reply.status(400).send({
            success: false,
            error: result.message,
          });
        }
      } catch (error) {
        fastify.log.error({
          error,
          inviteCode,
          receiverId: request.user.userId,
          msg: 'Error in POST /invites/:inviteCode/accept endpoint',
        });
        return reply.status(500).send({
          error: 'Failed to accept invite',
        });
      }
    }
  );
}
