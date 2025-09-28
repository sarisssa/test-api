import websocket, { SocketStream } from '@fastify/websocket'
import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { WebSocketManager } from '../websocket/connection-manager.js'
import { handleInboundMessage } from '../services/ws-inbound-handler.js'

declare module 'fastify' {
  interface FastifyInstance {
    wsManager: WebSocketManager
  }
}

type WebsocketQuery = {
  token?: string
}

const websocketPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(websocket)

  const manager = new WebSocketManager(fastify)
  await manager.initialize()
  fastify.decorate('wsManager', manager)

  fastify.addHook('onClose', async () => {
    await manager.close()
  })

  fastify.get('/ws', { websocket: true }, async (
    connection: SocketStream,
    request: FastifyRequest<{ Querystring: WebsocketQuery }>
  ) => {
    const { token } = request.query
    if (!token) {
      connection.socket.send(JSON.stringify({ ok: false, error: 'missing_token' }))
      connection.socket.close()
      return
    }

    let userId: string
    try {
      const decoded = fastify.jwt.verify(token) as { userId?: string }
      if (!decoded?.userId) {
        throw new Error('missing_user_id')
      }
      userId = decoded.userId
    } catch (error) {
      fastify.log.warn({ error }, 'WebSocket auth failed')
      connection.socket.send(JSON.stringify({ ok: false, error: 'invalid_token' }))
      connection.socket.close()
      return
    }

    const connectionId = manager.registerConnection(userId, connection.socket)

    connection.socket.send(
      JSON.stringify({ ok: true, type: 'connected', connectionId })
    )

    connection.socket.on('message', async (raw: Buffer) => {
      try {
        const parsed = JSON.parse(raw.toString()) as {
          action?: string
          payload?: unknown
        }

        const response = await handleInboundMessage(fastify, {
          action: parsed.action,
          payload: parsed.payload,
          connectionId,
          userId
        })

        if (response) {
          await fastify.wsManager.sendToConnection(connectionId, response)
        }
      } catch (error) {
        fastify.log.error({ error }, 'Failed to process WS message')
        await fastify.wsManager.sendToConnection(connectionId, {
          ok: false,
          error: 'invalid_payload'
        })
      }
    })
  })
}

export default fp(websocketPlugin)
