export interface InviteCodeParams {
  inviteCode: string;
}

export interface AcceptInviteBody {
  inviteCode: string;
}

export const inviteCodeParamsJsonSchema = {
  type: 'object',
  properties: {
    inviteCode: {
      type: 'string',
      minLength: 8,
      maxLength: 8,
      pattern: '^[A-Z0-9]+$',
    },
  },
  required: ['inviteCode'],
  additionalProperties: false,
} as const;

export const acceptInviteBodyJsonSchema = {
  type: 'object',
  properties: {
    inviteCode: {
      type: 'string',
      minLength: 8,
      maxLength: 8,
      pattern: '^[A-Z0-9]+$',
    },
  },
  required: ['inviteCode'],
  additionalProperties: false,
} as const;

export const createInviteResponseJsonSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    inviteCode: {
      type: 'string',
      minLength: 8,
      maxLength: 8,
      pattern: '^[A-Z0-9]+$',
    },
    inviteUrl: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['success', 'inviteCode', 'inviteUrl', 'createdAt'],
  additionalProperties: false,
} as const;
