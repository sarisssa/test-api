import { FastifyInstance } from 'fastify';

type InboundRequestBody = {
  action?: string;
  payload?: unknown;
  connectionId?: string;
  userId?: string;
  requestContext?: {
    domainName?: string;
    stage?: string;
  };
};

export default async function wsInboundRoutes(fastify: FastifyInstance) {
  fastify.post('/ws/inbound', async (request, reply) => {
    const body = request.body as InboundRequestBody | undefined;

    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ ok: false, message: 'Invalid JSON body' });
    }

    if (!body.action) {
      return reply.code(400).send({ ok: false, message: 'Missing action' });
    }

    fastify.log.info({ body }, 'Received WS inbound message');

    return reply.code(200).send({ ok: true });
  });
}

