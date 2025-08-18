import { FastifyEnvOptions } from '@fastify/env';

export const envSchema: FastifyEnvOptions['schema'] = {
  type: 'object',
  required: [
    'JWT_SECRET',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_VERIFY_SERVICE_SID',
    'TWELVE_DATA_API_KEY',
    'PHONE_HASH_SALT',
  ],
  properties: {
    JWT_SECRET: {
      type: 'string',
      minLength: 1,
    },
    REDIS_URL: {
      type: 'string',
      default: 'redis://127.0.0.1:6379',
    },
    DYNAMODB_URL: {
      type: 'string',
      default: 'http://localhost:4566', // LocalStack endpoint
    },
    TWELVE_DATA_API_KEY: {
      type: 'string',
      minLength: 1,
    },
    DYNAMODB_REGION: {
      type: 'string',
      default: 'us-east-1',
    },
    TWILIO_ACCOUNT_SID: {
      type: 'string',
      minLength: 1,
    },
    TWILIO_AUTH_TOKEN: {
      type: 'string',
      minLength: 1,
    },
    TWILIO_VERIFY_SERVICE_SID: {
      type: 'string',
      minLength: 1,
    },
    PHONE_HASH_SALT: {
      type: 'string',
      minLength: 1,
    },
    PORT: {
      type: 'number',
      default: 3000,
    },
    HOST: {
      type: 'string',
      default: '0.0.0.0',
    },
    NODE_ENV: {
      type: 'string',
      enum: ['development', 'production', 'test'],
      default: 'development',
    },
  },
};

export type Env = {
  JWT_SECRET: string;
  REDIS_URL: string;
  DYNAMODB_URL: string;
  DYNAMODB_REGION: string;
  TWELVE_DATA_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_VERIFY_SERVICE_SID: string;
  PHONE_HASH_SALT: string;
  PORT: number;
  HOST: string;
  NODE_ENV: 'development' | 'production' | 'test';
};
