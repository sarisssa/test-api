import { S3Client } from '@aws-sdk/client-s3';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    s3: S3Client;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const s3Client = new S3Client({
    region: fastify.config.AWS_REGION,
  });

  fastify.decorate('s3', s3Client);
});
