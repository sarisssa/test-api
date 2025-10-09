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
          perkId: { type: 'string' },
          perkName: { type: 'string' },
          description: { type: 'string' },
          cost: { type: 'number' },
          requiredPlayerTier: { type: 'number' },
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
          perkId: { type: 'string' },
          perk: {
            type: 'object',
            properties: {
              perkName: { type: 'string' },
              description: { type: 'string' },
            },
          },
          purchasedAt: { type: 'string' },
          quantity: { type: 'number' },
        },
      },
    },
    count: { type: 'number' },
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
    success: { type: 'boolean', enum: [true] },
    message: { type: 'string' },
    newBalance: { type: 'number' },
  },
  required: ['success', 'message', 'newBalance'],
} as const;
