import { FastifyInstance } from 'fastify';
import {
  NotificationItem,
  NotificationsResponse,
} from '../models/notification.js';

export const getUserNotifications = async (
  fastify: FastifyInstance,
  userId: string
): Promise<NotificationsResponse> => {
  try {
    const [friendRequests, challenges, acceptedNotifications] =
      await Promise.all([
        fastify.repositories.friend.getUserRequests(userId),
        fastify.repositories.challenge.getUserChallenges(userId),
        fastify.repositories.notification.getUserNotifications(userId),
      ]);

    const incomingFriendRequests = friendRequests.filter(
      request => request.receiverId === userId && request.status === 'PENDING'
    );

    const incomingChallenges = challenges.filter(
      challenge =>
        challenge.challengedId === userId && challenge.status === 'PENDING'
    );

    const friendRequestNotifications: NotificationItem[] = await Promise.all(
      incomingFriendRequests.map(async request => {
        const sender = await fastify.repositories.user.getUserById(
          request.senderId
        );

        return {
          id: request.requestId,
          type: 'friend_request' as const,
          createdAt: request.requestedAt,
          readAt: request.readAt,
          data: {
            senderUsername: sender?.username,
            senderAvatarId: sender?.avatarId,
          },
        };
      })
    );

    const challengeNotifications: NotificationItem[] = await Promise.all(
      incomingChallenges.map(async challenge => {
        const challenger = await fastify.repositories.user.getUserById(
          challenge.challengerId
        );

        return {
          id: challenge.challengeId,
          type: 'challenge' as const,
          createdAt: challenge.createdAt,
          readAt: challenge.readAt,
          data: {
            challengerUsername: challenger?.username,
            challengerAvatarId: challenger?.avatarId,
            category: challenge.category,
            amount: challenge.amount,
            duration: challenge.duration,
          },
        };
      })
    );

    const acceptedNotificationItems: NotificationItem[] = await Promise.all(
      acceptedNotifications.map(async notification => {
        const accepter = await fastify.repositories.user.getUserById(
          notification.relatedUserId
        );

        const notificationType =
          notification.notificationType === 'friend_request_accepted'
            ? ('friend_request_accepted' as const)
            : ('challenge_accepted' as const);

        return {
          id: notification.notificationId,
          type: notificationType,
          createdAt: notification.createdAt,
          readAt: notification.readAt,
          data: {
            accepterUsername: accepter?.username,
            accepterAvatarId: accepter?.avatarId,
          },
        };
      })
    );

    const allNotifications = [
      ...friendRequestNotifications,
      ...challengeNotifications,
      ...acceptedNotificationItems,
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const unreadCount = allNotifications.filter(n => !n.readAt).length;

    return {
      notifications: allNotifications,
      stats: {
        total: allNotifications.length,
        unread: unreadCount,
      },
    };
  } catch (error) {
    fastify.log.error({
      error,
      userId,
      msg: 'Error in getUserNotifications service',
    });
    throw error;
  }
};

export const markNotificationAsRead = async (
  fastify: FastifyInstance,
  userId: string,
  notificationId: string,
  notificationType: 'friend_request' | 'challenge' | 'notification'
): Promise<{ readAt: string }> => {
  try {
    const now = new Date().toISOString();

    if (notificationType === 'friend_request') {
      await fastify.repositories.friend.markFriendRequestAsRead(
        userId,
        notificationId
      );
    } else if (notificationType === 'challenge') {
      await fastify.repositories.challenge.markChallengeAsRead(
        userId,
        notificationId
      );
    } else if (notificationType === 'notification') {
      await fastify.repositories.notification.markNotificationAsRead(
        userId,
        notificationId
      );
    } else {
      throw new Error('Invalid notification type');
    }

    return { readAt: now };
  } catch (error) {
    fastify.log.error({
      error,
      userId,
      notificationId,
      notificationType,
      msg: 'Error in markNotificationAsRead service',
    });
    throw error;
  }
};
