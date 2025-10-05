import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { createAssetRepository } from '../repositories/asset-repository.js';
import { createFriendRepository } from '../repositories/friend-repository.js';
import { createInviteRepository } from '../repositories/invite-repository.js';
import { createMatchRepository } from '../repositories/match-repository.js';
import { createMatchmakingRepository } from '../repositories/matchmaking-repository.js';
import { createPerkRepository } from '../repositories/perk-repository.js';
import { createUserRepository } from '../repositories/user-repository.js';

declare module 'fastify' {
  interface FastifyInstance {
    repositories: {
      match: ReturnType<typeof createMatchRepository>;
      user: ReturnType<typeof createUserRepository>;
      matchmaking: ReturnType<typeof createMatchmakingRepository>;
      asset: ReturnType<typeof createAssetRepository>;
      perk: ReturnType<typeof createPerkRepository>;
      invite: ReturnType<typeof createInviteRepository>;
      friend: ReturnType<typeof createFriendRepository>;
    };
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const repositories = {
    match: createMatchRepository(fastify),
    user: createUserRepository(fastify),
    matchmaking: createMatchmakingRepository(fastify),
    asset: createAssetRepository(fastify),
    perk: createPerkRepository(fastify),
    invite: createInviteRepository(fastify),
    friend: createFriendRepository(fastify),
  };

  fastify.decorate('repositories', repositories);

  fastify.log.info('Repositories plugin registered');
});
