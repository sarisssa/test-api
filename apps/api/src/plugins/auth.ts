import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      userId: string;
    };
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.addHook('onRoute', routeOptions => {
    if (
      routeOptions.path === '/health' ||
      routeOptions.path.startsWith('/auth/')
    ) {
      return;
    }

    const preHandler = async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        void err;
        reply.status(401).send({ error: 'Unauthorized' });
      }
    };

    if (routeOptions.preHandler) {
      if (Array.isArray(routeOptions.preHandler)) {
        routeOptions.preHandler.unshift(preHandler);
      } else {
        routeOptions.preHandler = [preHandler, routeOptions.preHandler];
      }
    } else {
      routeOptions.preHandler = preHandler;
    }
  });
}

export default fp(authPlugin, {
  name: 'auth-plugin',
  dependencies: ['@fastify/jwt'],
});
