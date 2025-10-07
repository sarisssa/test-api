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
