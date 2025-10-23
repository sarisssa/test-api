import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    s3: S3Client;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const config: S3ClientConfig = {
    region: fastify.config.AWS_REGION,
  };

  if (fastify.config.S3_ENDPOINT) {
    config.endpoint = fastify.config.S3_ENDPOINT;
    config.forcePathStyle = true;
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    };
  }

  const s3Client = new S3Client(config);

  fastify.decorate('s3', s3Client);
});
