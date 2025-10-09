import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

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

        if (request.user.type !== 'access_token') {
          fastify.log.warn({
            userId: request.user.userId,
            tokenType: request.user.type,
            msg: 'Invalid token type for API access',
          });
          return reply.status(401).send({
            error: 'Unauthorized',
            message: 'Invalid token type',
          });
        }
      } catch (err) {
        fastify.log.error({
          error: err,
          msg: 'JWT verification failed in auth plugin',
        });
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
