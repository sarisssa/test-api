export interface SendOtpBody {
  phoneNumber: string;
}

export interface VerifyOtpBody {
  code: string;
  phoneNumber: string;
}

export const sendOtpJsonSchema = {
  type: 'object',
  properties: {
    phoneNumber: {
      type: 'string',
      pattern: '^\\+?\\d{10,15}$',
    },
  },
  required: ['phoneNumber'],
  additionalProperties: false,
} as const;

export const verifyOtpJsonSchema = {
  type: 'object',
  properties: {
    code: {
      type: 'string',
      pattern: '^\\d{6}$',
    },
    phoneNumber: {
      type: 'string',
      pattern: '^\\+?\\d{10,15}$',
    },
  },
  required: ['code', 'phoneNumber'],
  additionalProperties: false,
} as const;

export const sendOtpResponseJsonSchema = {
  description: 'OTP sent successfully',
  type: 'object',
  properties: {
    message: { type: 'string' },
  },
} as const;

export const verifyOtpResponseJsonSchema = {
  description: 'OTP verified successfully',
  type: 'object',
  properties: {
    message: { type: 'string' },
    accessToken: { type: 'string' },
    refreshToken: { type: 'string' },
    user: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        phoneNumber: { type: 'string' },
        username: { type: 'string', nullable: true },
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
        profile: {
          type: 'object',
          properties: {
            profilePictureUrl: { type: 'string', nullable: true },
            bio: { type: 'string', nullable: true },
          },
        },
      },
    },
  },
} as const;
