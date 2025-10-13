import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { ErrorResponseSchema } from '../types/error.js';

export default fp(async function (fastify: FastifyInstance) {
  fastify.addSchema(ErrorResponseSchema);
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Wage API',
        description: 'API documentation for the Wage API',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Local development',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'auth', description: 'Authentication endpoints' },
        { name: 'user', description: 'User endpoints' },
        { name: 'assets', description: 'Asset endpoints' },
        { name: 'perks', description: 'Perk endpoints' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
  });

  fastify.log.info('Swagger documentation available at /docs');
});
