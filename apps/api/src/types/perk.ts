export interface BuyPerkBody {
  perkId: string;
}

export const buyPerkJsonSchema = {
  type: 'object',
  properties: {
    perkId: { type: 'string' },
  },
  required: ['perkId'],
  additionalProperties: false,
} as const;
