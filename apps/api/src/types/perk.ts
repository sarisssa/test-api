export interface BuyPerkBody {
  perkId: string;
}

export const perksResponseJsonSchema = {
  description: 'List of all perks',
  type: 'object',
  properties: {
    perks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          chipsCost: { type: 'number' },
          class: {
            type: 'string',
            enum: ['Default', 'Basic', 'Mid', 'Elite'],
          },
          minimumPlayerTier: { type: 'number' },
          description: { type: 'string' },
          imageUrl: { type: 'string' },
        },
      },
    },
    count: { type: 'number' },
  },
} as const;

export const userPerksResponseJsonSchema = {
  description: "List of user's perks",
  type: 'object',
  properties: {
    perks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          imageUrl: { type: 'string' },
          quantity: { type: 'number' },
        },
      },
    },
    stats: {
      type: 'object',
      properties: {
        total: { type: 'number' },
      },
    },
  },
} as const;

export const buyPerkJsonSchema = {
  type: 'object',
  properties: {
    perkId: { type: 'string' },
  },
  required: ['perkId'],
  additionalProperties: false,
} as const;

export const buyPerkResponseJsonSchema = {
  description: 'Perk purchased successfully',
  type: 'object',
  properties: {
    message: { type: 'string' },
    newBalance: { type: 'number' },
  },
  required: ['success', 'message', 'newBalance'],
} as const;
