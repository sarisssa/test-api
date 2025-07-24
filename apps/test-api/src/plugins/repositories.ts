import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { createMatchRepository } from '../repositories/match-repository.js';
import { createMatchmakingRepository } from '../repositories/matchmaking-repository.js';
import { createUserRepository } from '../repositories/user-repository.js';

declare module 'fastify' {
  interface FastifyInstance {
    repositories: {
      match: ReturnType<typeof createMatchRepository>;
      user: ReturnType<typeof createUserRepository>;
      matchmaking: ReturnType<typeof createMatchmakingRepository>;
    };
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const repositories = {
    match: createMatchRepository(fastify),
    user: createUserRepository(fastify),
    matchmaking: createMatchmakingRepository(fastify),
  };

  fastify.decorate('repositories', repositories);

  fastify.log.info('Repositories plugin registered');
});
