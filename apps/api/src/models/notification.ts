// Notification types are composed from existing Friend Request and Challenge models

// Persistent notification stored in DynamoDB (for accepted requests/challenges)
export interface DynamoDBNotificationItem {
  pk: `USER#${string}`;
  sk: `NOTIFICATION#${string}`;
  EntityType: 'Notification';
  notificationId: string;
  notificationType: 'friend_request_accepted' | 'challenge_accepted';
  relatedUserId: string; // The user who triggered the notification (accepter)
  createdAt: string;
  readAt?: string;
}

export interface NotificationItem {
  id: string;
  type:
    | 'friend_request'
    | 'challenge'
    | 'friend_request_accepted'
    | 'challenge_accepted';
  createdAt: string;
  readAt?: string;
  data:
    | {
        senderUsername?: string;
        senderAvatarId?: string;
      }
    | {
        challengerUsername?: string;
        challengerAvatarId?: string;
        category: 'stock' | 'crypto' | 'commodities';
        amount: 5 | 10 | 15 | 25;
        duration: 30 | 60 | 120 | 240;
      }
    | {
        accepterUsername?: string;
        accepterAvatarId?: string;
      };
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  stats: {
    total: number;
    unread: number;
  };
}
