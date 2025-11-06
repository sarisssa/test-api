export interface MarkNotificationReadParams {
  notificationId: string;
  notificationType: 'friend_request' | 'challenge' | 'notification';
}

export const markNotificationReadParamsJsonSchema = {
  type: 'object',
  properties: {
    notificationId: {
      type: 'string',
      description:
        'The ID of the notification (requestId, challengeId, or notificationId)',
    },
    notificationType: {
      type: 'string',
      enum: ['friend_request', 'challenge', 'notification'],
      description: 'The type of notification',
    },
  },
  required: ['notificationId', 'notificationType'],
  additionalProperties: false,
} as const;

const friendRequestDataSchema = {
  type: 'object',
  properties: {
    senderUsername: {
      type: 'string',
    },
    senderAvatarId: {
      type: 'string',
    },
  },
  additionalProperties: false,
} as const;

const challengeDataSchema = {
  type: 'object',
  properties: {
    challengerUsername: {
      type: 'string',
    },
    challengerAvatarId: {
      type: 'string',
    },
    category: {
      type: 'string',
      enum: ['stock', 'crypto', 'commodities'],
    },
    amount: {
      type: 'number',
      enum: [5, 10, 15, 25],
    },
    duration: {
      type: 'number',
      enum: [30, 60, 120, 240],
    },
  },
  required: ['category', 'amount', 'duration'],
  additionalProperties: false,
} as const;

const acceptedDataSchema = {
  type: 'object',
  properties: {
    accepterUsername: {
      type: 'string',
    },
    accepterAvatarId: {
      type: 'string',
    },
  },
  additionalProperties: false,
} as const;

export const notificationItemJsonSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: 'Unique identifier for the notification',
    },
    type: {
      type: 'string',
      enum: [
        'friend_request',
        'challenge',
        'friend_request_accepted',
        'challenge_accepted',
      ],
      description: 'Type of notification',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
      description: 'When the notification was created',
    },
    readAt: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'When the notification was read by the user',
    },
    data: {
      oneOf: [friendRequestDataSchema, challengeDataSchema, acceptedDataSchema],
      description: 'Notification-specific data',
    },
  },
  required: ['id', 'type', 'createdAt', 'data'],
  additionalProperties: false,
} as const;

export const notificationsResponseJsonSchema = {
  type: 'object',
  properties: {
    notifications: {
      type: 'array',
      items: notificationItemJsonSchema,
      description: 'Array of notifications',
    },
    stats: {
      type: 'object',
      properties: {
        total: {
          type: 'number',
          description: 'Total number of notifications',
        },
        unread: {
          type: 'number',
          description: 'Number of unread notifications',
        },
      },
      required: ['total', 'unread'],
    },
  },
  required: ['notifications', 'stats'],
  additionalProperties: false,
} as const;

export const markNotificationReadResponseJsonSchema = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      example: 'Notification marked as read',
    },
    notificationId: {
      type: 'string',
    },
    readAt: {
      type: 'string',
      format: 'date-time',
    },
  },
  required: ['message', 'notificationId', 'readAt'],
  additionalProperties: false,
} as const;
