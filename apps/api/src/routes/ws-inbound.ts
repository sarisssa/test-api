import { FastifyInstance } from 'fastify'
import { handleInboundMessage } from '../services/ws-inbound-handler.js'

export default async function wsInboundRoutes(fastify: FastifyInstance) {
  fastify.post('/ws/inbound', async (request, reply) => {
    const body = request.body || {}
    const response = await handleInboundMessage(fastify, body)
    if (response.ok) {
      return reply.code(200).send(response)
    }

    const statusMap: Record<string, number> = {
      missing_user: 401,
      internal_error: 500
    }
    const status = statusMap[response.error ?? ''] ?? 400
    return reply.code(status).send(response)
  })
}
