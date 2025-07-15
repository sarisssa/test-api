import { FastifyInstance } from 'fastify';

export default async function assetRoutes(fastify: FastifyInstance) {
  // Base assets endpoint (optional, could just have the specific types)
  fastify.get('/', async (request, reply) => {
    return { status: 'List all assets endpoint (or provide a directory)' };
  });

  // Stock routes
  fastify.get('/assets/stocks', async (request, reply) => {
    // Logic to list all stocks
    return { status: 'List all stocks endpoint' };
  });

  fastify.get('/assets/stocks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    // Logic to get a specific stock by ID
    return { status: `Get single stock with ID: ${id}` };
  });

  // Crypto routes
  fastify.get('/assets/crypto', async (request, reply) => {
    // Logic to list all cryptocurrencies
    return { status: 'List all cryptocurrencies endpoint' };
  });

  fastify.get('/assets/crypto/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    // Logic to get a specific cryptocurrency by ID
    return { status: `Get single cryptocurrency with ID: ${id}` };
  });

  // Commodities routes
  fastify.get('/assets/commodities', async (request, reply) => {
    // Logic to list all commodities
    return { status: 'List all commodities endpoint' };
  });

  fastify.get('/assets/commodities/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    // Logic to get a specific commodity by ID
    return { status: `Get single commodity with ID: ${id}` };
  });
}
