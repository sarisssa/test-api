import { FastifyInstance } from 'fastify';
import { getUserFriends, getUserRequests } from '../services/friend.js';

export default async function friendRoutes(fastify: FastifyInstance) {
  fastify.get('/users/:userId/friends', async (request, reply) => {
    const { userId } = request.params as { userId: string };

    try {
      const friends = await getUserFriends(fastify, userId);
      return reply.send(friends);
    } catch (error) {
      fastify.log.error({
        error,
        userId,
        msg: 'Error in GET /users/:userId/friends endpoint',
      });
      return reply.status(500).send({
        error: 'Failed to fetch friends',
      });
    }
  });

  fastify.get('/users/:userId/requests', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { direction = 'incoming' } = request.query as {
      direction?: 'incoming' | 'outgoing';
    };

    if (direction !== 'incoming' && direction !== 'outgoing') {
      return reply.status(400).send({
        error: 'Invalid direction parameter. Must be "incoming" or "outgoing"',
      });
    }

    try {
      const requests = await getUserRequests(fastify, userId, direction);
      return reply.send(requests);
    } catch (error) {
      fastify.log.error({
        error,
        userId,
        direction,
        msg: 'Error in GET /users/:userId/requests endpoint',
      });
      return reply.status(500).send({
        error: 'Failed to fetch friend requests',
      });
    }
  });

  fastify.post('/requests', async (request, reply) => {
    const { senderId, receiverId } = request.body as {
      senderId: string;
      receiverId: string;
    };

    if (!senderId || !receiverId) {
      return reply.status(400).send({
        error: 'Missing required fields: senderId and receiverId',
      });
    }

    if (senderId === receiverId) {
      return reply.status(400).send({
        error: 'Cannot send friend request to yourself',
      });
    }

    try {
      const request = await fastify.repositories.friend.createFriendRequest(
        senderId,
        receiverId
      );

      return reply.status(201).send({
        requestId: request.requestId,
        message: 'Friend request sent successfully',
      });
    } catch (error) {
      fastify.log.error({
        error,
        senderId,
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
    const { userId, status } = request.body as {
      userId: string;
      status: 'accepted' | 'rejected';
    };

    if (!userId || !status) {
      return reply.status(400).send({
        error: 'Missing required fields: userId and status',
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

      if (friendRequest.receiverId !== userId) {
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
        userId,
        status,
        msg: 'Error in PATCH /requests/:requestId endpoint',
      });
      return reply.status(500).send({
        error: 'Failed to process friend request',
      });
    }
  });

  fastify.delete('/users/:userId/friends/:friendId', async (request, reply) => {
    const { userId, friendId } = request.params as {
      userId: string;
      friendId: string;
    };

    try {
      await fastify.repositories.friend.deleteFriendship(userId, friendId);
      return reply.status(200).send({
        message: 'Friend removed successfully',
      });
    } catch (error) {
      fastify.log.error({
        error,
        userId,
        friendId,
        msg: 'Error in DELETE /users/:userId/friends/:friendId endpoint',
      });
      return reply.status(500).send({
        error: 'Failed to remove friend',
      });
    }
  });
}
