import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { createMatchRepository } from '../repositories/match-repository.js';
import { createUserRepository } from '../repositories/user-repository.js';

declare module 'fastify' {
  interface FastifyInstance {
    repositories: {
      match: ReturnType<typeof createMatchRepository>;
      user: ReturnType<typeof createUserRepository>;
    };
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const repositories = {
    match: createMatchRepository(fastify),
    user: createUserRepository(fastify),
  };

  fastify.decorate('repositories', repositories);

  fastify.log.info('Repositories plugin registered');
});
