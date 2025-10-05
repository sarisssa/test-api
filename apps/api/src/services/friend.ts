import { FastifyInstance } from 'fastify';
import { FriendRequestResponse, FriendResponse } from '../models/friend.js';
import { calculatePlayerTier } from '../utils/player-tier.js';

export const getUserFriends = async (
  fastify: FastifyInstance,
  userId: string
): Promise<FriendResponse[]> => {
  try {
    const friendships =
      await fastify.repositories.friend.getUserFriends(userId);

    const enrichedFriends = await Promise.all(
      friendships.map(async friendship => {
        const friend = await fastify.repositories.user.getUserById(
          friendship.friendId
        );
        if (!friend) return null;

        const tier = calculatePlayerTier(friend.experiencePoints);

        return {
          userId: friend.userId,
          username: friend.username,
          profilePictureUrl: friend.profilePictureUrl,
          stats: {
            tier: tier.name,
            experience: friend.experiencePoints,
            wins: friend.stats.wins,
            losses: friend.stats.losses,
          },
          friendSince: friendship.friendSince,
        };
      })
    );

    return enrichedFriends.filter(
      (f): f is NonNullable<(typeof enrichedFriends)[number]> => f !== null
    );
  } catch (error) {
    fastify.log.error({
      error,
      userId,
      msg: 'Error in getUserFriends service',
    });
    throw error;
  }
};

export const getUserRequests = async (
  fastify: FastifyInstance,
  userId: string,
  direction: 'incoming' | 'outgoing'
): Promise<FriendRequestResponse[]> => {
  try {
    const requests = await fastify.repositories.friend.getUserRequests(
      userId,
      direction
    );

    const enrichedRequests = await Promise.all(
      requests.map(async request => {
        const otherUserId =
          direction === 'incoming' ? request.senderId : request.receiverId;
        const otherUser =
          await fastify.repositories.user.getUserById(otherUserId);
        if (!otherUser) return null;

        return {
          requestId: request.requestId,
          userId: otherUser.userId,
          username: otherUser.username || undefined,
          profilePictureUrl: otherUser.profilePictureUrl || undefined,
          requestedAt: request.requestedAt,
          direction,
        };
      })
    );

    return enrichedRequests.filter(
      (r): r is NonNullable<(typeof enrichedRequests)[number]> => r !== null
    );
  } catch (error) {
    fastify.log.error({
      error,
      userId,
      direction,
      msg: 'Error in getUserRequests service',
    });
    throw error;
  }
};
