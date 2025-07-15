import { FastifyEnvOptions } from '@fastify/env';

export const envSchema: FastifyEnvOptions['schema'] = {
  type: 'object',
  required: ['JWT_SECRET'],
  properties: {
    JWT_SECRET: {
      type: 'string',
      minLength: 1,
    },
    REDIS_URL: {
      type: 'string',
      default: 'redis://127.0.0.1:6379',
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
  PORT: number;
  HOST: string;
  NODE_ENV: 'development' | 'production' | 'test';
};
