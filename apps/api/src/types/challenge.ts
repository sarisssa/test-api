export interface CreateChallengeBody {
  challengedId: string;
  duration: 30 | 60 | 120 | 240;
  amount: 5 | 10 | 15 | 25;
  category: 'stock' | 'crypto' | 'commodities';
}

export interface UpdateChallengeParams {
  challengeId: string;
}

export interface UpdateChallengeBody {
  status: 'accepted' | 'rejected';
}

export const createChallengeJsonSchema = {
  type: 'object',
  properties: {
    challengedId: {
      type: 'string',
      pattern:
        '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    },
    duration: {
      type: 'number',
      enum: [30, 60, 120, 240],
    },
    amount: {
      type: 'number',
      enum: [5, 10, 15, 25],
    },
    category: {
      type: 'string',
      enum: ['stock', 'crypto', 'commodities'],
    },
  },
  required: ['challengedId', 'duration', 'amount', 'category'],
  additionalProperties: false,
} as const;

export const updateChallengeParamsJsonSchema = {
  type: 'object',
  properties: {
    challengeId: {
      type: 'string',
      pattern:
        '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    },
  },
  required: ['challengeId'],
  additionalProperties: false,
} as const;

export const challengesResponseJsonSchema = {
  type: 'object',
  properties: {
    challenges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          challengeId: { type: 'string' },
          challenger: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              username: { type: 'string' },
              profilePictureUrl: { type: 'string' },
            },
          },
          challenged: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              username: { type: 'string' },
              profilePictureUrl: { type: 'string' },
            },
          },
          status: {
            type: 'string',
            enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
          },
          duration: { type: 'number', enum: [30, 60, 120, 240] },
          amount: { type: 'number', enum: [5, 10, 15, 25] },
          category: {
            type: 'string',
            enum: ['stock', 'crypto', 'commodities'],
          },
          createdAt: { type: 'string' },
          direction: { type: 'string', enum: ['outgoing', 'incoming'] },
          expiresAt: { type: 'string' },
        },
      },
    },
    stats: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        outgoing: { type: 'number' },
        incoming: { type: 'number' },
      },
    },
  },
} as const;

export const createChallengeResponseJsonSchema = {
  type: 'object',
  properties: {
    challengeId: { type: 'string' },
    message: { type: 'string' },
    challenge: {
      type: 'object',
      properties: {
        challengeId: { type: 'string' },
        challenger: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            username: { type: 'string' },
            profilePictureUrl: { type: 'string' },
          },
        },
        challenged: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            username: { type: 'string' },
            profilePictureUrl: { type: 'string' },
          },
        },
        status: { type: 'string' },
        duration: { type: 'number' },
        amount: { type: 'number' },
        category: { type: 'string' },
        createdAt: { type: 'string' },
        direction: { type: 'string' },
        expiresAt: { type: 'string' },
      },
    },
  },
} as const;
