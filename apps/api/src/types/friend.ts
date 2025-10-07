export interface CreateFriendRequestBody {
  receiverId: string;
}

export interface UpdateFriendRequestParams {
  requestId: string;
}

export interface GetFriendRequestsQuery {
  type: 'incoming' | 'outgoing';
}

export const createFriendRequestJsonSchema = {
  type: 'object',
  properties: {
    receiverId: {
      type: 'string',
      pattern:
        '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    },
  },
  required: ['receiverId'],
  additionalProperties: false,
} as const;

export const updateFriendRequestParamsJsonSchema = {
  type: 'object',
  properties: {
    requestId: {
      type: 'string',
      pattern:
        '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    },
  },
  required: ['requestId'],
  additionalProperties: false,
} as const;

export const getFriendRequestsQueryJsonSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['incoming', 'outgoing'],
    },
  },
  required: ['type'],
  additionalProperties: false,
} as const;
