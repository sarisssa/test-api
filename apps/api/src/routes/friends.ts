import { FastifyInstance } from 'fastify';

export default async function friendRoutes(fastify: FastifyInstance) {
  fastify.post('/requests', async (request, reply) => {
    const { receiverId } = request.body as {
      receiverId: string;
    };

    if (!receiverId) {
      return reply.status(400).send({
        error: 'Missing required field: receiverId',
      });
    }

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
  });

  fastify.patch('/requests/:requestId', async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    const { status } = request.body as {
      status: 'accepted' | 'rejected';
    };

    if (!status) {
      return reply.status(400).send({
        error: 'Missing required field: status',
      });
    }

    if (status !== 'accepted' && status !== 'rejected') {
      return reply.status(400).send({
        error: 'Invalid status. Must be "accepted" or "rejected"',
      });
    }

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
  });

  fastify.delete('/friends/:friendId', async (request, reply) => {
    const { friendId } = request.params as {
      friendId: string;
    };

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
  });
}
