import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { createMatchRepository } from '../repositories/match-repository.js';

declare module 'fastify' {
  interface FastifyInstance {
    repositories: {
      match: ReturnType<typeof createMatchRepository>;
    };
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const repositories = {
    match: createMatchRepository(fastify),
  };

  fastify.decorate('repositories', repositories);

  fastify.log.info('Repositories plugin registered');
});
