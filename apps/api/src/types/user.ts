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

export const matchesResponseJsonSchema = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          matchId: { type: 'string' },
          startTime: { type: 'string', format: 'date-time' },
          endTime: { type: 'string', format: 'date-time' },
          status: { type: 'string' },
          players: { type: 'object' },
        },
        required: ['matchId', 'startTime', 'status', 'players'],
      },
    },
    total: { type: 'number' },
  },
  required: ['matches', 'total'],
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
  },
  required: ['friends'],
  additionalProperties: false,
} as const;
