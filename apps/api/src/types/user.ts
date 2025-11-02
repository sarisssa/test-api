export interface UpdateUsernameBody {
  username: string;
}

export interface UploadRouteParams {
  userId: string;
}

export interface GetFriendRequestsQuery {
  type?: 'incoming' | 'outgoing';
}

export interface UserMatch {
  matchId: string;
  startTime: string;
  endTime?: string;
  status: string;
  players: Record<string, unknown>;
}

// ------------------------------------
// User/Profile Schemas
// ------------------------------------

export interface SuggestUsernameResponse {
  suggestions: string[];
}

export const suggestUsernameResponseJsonSchema = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      description: 'An array of two suggested usernames.',
      items: {
        type: 'string',
        example: 'EliteBull_1234',
      },
    },
  },
  required: ['suggestions'],
};

export const updateUsernameJsonSchema = {
  type: 'object',
  properties: {
    username: {
      type: 'string',
      minLength: 3,
      maxLength: 32,
      pattern: '^[a-zA-Z0-9_-]+$',
    },
  },
  required: ['username'],
  additionalProperties: false,
} as const;

export const updateUsernameResponseJsonSchema = {
  description: 'Username updated successfully',
  type: 'object',
  properties: {
    message: {
      type: 'string',
      example: 'Username updated successfully',
    },
    newUsername: {
      type: 'string',
      example: 'new_johndoe',
    },
  },
  required: ['message', 'newUsername'],
} as const;

export const userProfileResponseSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    phoneNumber: { type: 'string' },
    username: { type: 'string' },
    emailAddress: { type: 'string' },
    bio: { type: 'string' },
    stats: {
      type: 'object',
      properties: {
        totalMatches: { type: 'number' },
        wins: { type: 'number' },
        losses: { type: 'number' },
        experience: { type: 'number' },
        inGameCurrency: { type: 'number' },
      },
    },
    profilePictureUrl: { type: 'string', nullable: true },
    perks: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          purchasedAt: { type: 'string' },
          quantity: { type: 'number' },
        },
      },
    },
    createdAt: { type: 'string' },
    lastLoggedIn: { type: 'string' },
  },
  required: ['userId', 'phoneNumber', 'stats'],
} as const;

export const profilePictureResponseSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    profilePictureUrl: { type: 'string' },
    user: userProfileResponseSchema,
  },
  required: ['message', 'profilePictureUrl', 'user'],
  additionalProperties: false,
} as const;

// ------------------------------------
// Upload Schemas
// ------------------------------------

export const uploadRouteParamsJsonSchema = {
  type: 'object',
  properties: {
    userId: {
      type: 'string',
      pattern:
        '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    },
  },
  required: ['userId'],
  additionalProperties: false,
} as const;

// ------------------------------------
// Friends & Requests Schemas
// ------------------------------------

export const getFriendRequestsQueryJsonSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['incoming', 'outgoing'],
      default: 'incoming',
    },
  },
  additionalProperties: false,
} as const;

export const friendRequestResponseJsonSchema = {
  type: 'object',
  properties: {
    requestId: {
      type: 'string',
      description: 'Unique identifier for the friend request',
    },
    userId: {
      type: 'string',
      description: 'ID of the user who sent/received the request',
    },
    username: {
      type: 'string',
      description: 'Username of the user who sent/received the request',
    },
    profilePictureUrl: {
      type: 'string',
      nullable: true,
      description: "URL to the user's profile picture, if any",
    },
    requestedAt: {
      type: 'string',
      format: 'date-time',
      description: 'Timestamp when the request was created',
    },
    direction: {
      type: 'string',
      enum: ['incoming', 'outgoing'],
      description: 'Whether this is an incoming or outgoing request',
    },
  },
  required: ['requestId', 'userId', 'requestedAt', 'direction'],
  additionalProperties: false,
} as const;

export const friendRequestsResponseJsonSchema = {
  type: 'object',
  properties: {
    requests: {
      type: 'array',
      items: friendRequestResponseJsonSchema,
    },
    stats: {
      total: { type: 'number' },
      incoming: { type: 'number' },
      outgoing: { type: 'number' },
    },
  },
  required: ['requests', 'stats'],
  additionalProperties: false,
} as const;

export const friendsResponseJsonSchema = {
  type: 'object',
  properties: {
    friends: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            pattern:
              '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          },
          username: { type: 'string' },
          profilePictureUrl: { type: 'string', nullable: true },
        },
        required: ['userId', 'username'],
      },
    },
    stats: {
      type: 'object',
      properties: {
        total: { type: 'number' },
      },
    },
  },
  required: ['friends', 'stats'],
  additionalProperties: false,
} as const;

// ------------------------------------
// Matches & Invites Schemas
// ------------------------------------

export const matchesResponseJsonSchema = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          opponentId: { type: 'string' },
          opponentUsername: { type: 'string' },
          opponentProfilePictureUrl: { type: 'string', nullable: true },
          result: { type: 'string', enum: ['win', 'loss', 'pending'] },
          wagerAmount: { type: 'number' },
          duration: { type: 'number' },
          category: {
            type: 'string',
            enum: ['stock', 'crypto', 'commodities'],
          },
          createdAt: { type: 'string', format: 'date-time' },
          tentativeEndTime: { type: 'string', format: 'date-time' },
          endedAt: { type: 'string', format: 'date-time' },
          performancePercentage: { type: 'number' },
          opponentPerformancePercentage: { type: 'number' },
        },
        required: [
          'id',
          'opponentId',
          'opponentUsername',
          'result',
          'wagerAmount',
          'duration',
          'category',
          'createdAt',
          'tentativeEndTime',
          'performancePercentage',
          'opponentPerformancePercentage',
        ],
      },
    },
    stats: {
      type: 'object',
      properties: {
        total: { type: 'number' },
      },
    },
  },
  required: ['matches', 'stats'],
  additionalProperties: false,
} as const;

export const invitesResponseSchema = {
  type: 'object',
  properties: {
    invites: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          createdAt: { type: 'string' },
          inviteUrl: { type: 'string' },
        },
        required: ['status', 'createdAt', 'inviteUrl'],
      },
    },
    stats: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        sent: { type: 'number' },
        accepted: { type: 'number' },
      },
      required: ['total', 'sent', 'accepted'],
    },
  },
  required: ['invites', 'stats'],
  additionalProperties: false,
} as const;
