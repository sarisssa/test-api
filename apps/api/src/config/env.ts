import { FastifyEnvOptions } from '@fastify/env';

export const envSchema: FastifyEnvOptions['schema'] = {
  type: 'object',
  required: [
    'AWS_REGION',
    'DYNAMODB_TABLE_NAME',
    'S3_BUCKET_NAME',
    'JWT_SECRET',
    'PHONE_HASH_SALT',
    'TWELVE_DATA_API_KEY',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_VERIFY_SERVICE_SID',
    'WAGE_TABLE_NAME',
    'REDIS_TLS_REJECT_UNAUTHORIZED',
  ],
  properties: {
    AWS_REGION: {
      type: 'string',
      minLength: 1,
      default: 'us-east-1',
    },
    DYNAMODB_TABLE_NAME: {
      type: 'string',
      minLength: 1,
    },
    DYNAMODB_URL: {
      type: 'string',
    },
    S3_BUCKET_NAME: {
      type: 'string',
      minLength: 1,
      default: 'local-bucket',
    },
    S3_ENDPOINT: {
      type: 'string',
    },
    JWT_SECRET: {
      type: 'string',
      minLength: 1,
    },
    PHONE_HASH_SALT: {
      type: 'string',
      minLength: 1,
    },
    REDIS_URL: {
      type: 'string',
      default: 'redis://127.0.0.1:6379',
    },
    TWELVE_DATA_API_KEY: {
      type: 'string',
      minLength: 1,
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
    MATCH_SETTLEMENT_STATE_MACHINE_ARN: {
      type: 'string',
      default: '',
    },
    STEP_FUNCTIONS_ENDPOINT: {
      type: 'string',
      default: '',
    },
    WAGE_TABLE_NAME: {
      type: 'string',
      minLength: 1,
    },
    REDIS_TLS_REJECT_UNAUTHORIZED: {
      type: 'string',
      default: 'false',
    },
    USE_TWILIO_STUB: {
      type: 'string',
      default: 'false',
    },
    PRICE_STATUS_STALE_THRESHOLD_SECONDS: {
      type: 'string',
      default: '180',
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
    PORT: {
      type: 'number',
      default: 3000,
    },
  },
};

export type Env = {
  AWS_REGION: string;
  DYNAMODB_TABLE_NAME: string;
  DYNAMODB_URL?: string;
  S3_BUCKET_NAME: string;
  S3_ENDPOINT?: string;
  JWT_SECRET: string;
  PHONE_HASH_SALT: string;
  REDIS_URL: string;
  TWELVE_DATA_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_VERIFY_SERVICE_SID: string;
  MATCH_SETTLEMENT_STATE_MACHINE_ARN?: string;
  HOST: string;
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  WAGE_TABLE_NAME: string;
  REDIS_TLS_REJECT_UNAUTHORIZED: string;
  STEP_FUNCTIONS_ENDPOINT?: string;
  USE_TWILIO_STUB?: string;
  PRICE_STATUS_STALE_THRESHOLD_SECONDS: string;
};
