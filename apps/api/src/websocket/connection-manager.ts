import { randomUUID } from 'crypto'
import { FastifyInstance } from 'fastify'
import { SocketStream } from '@fastify/websocket'
import { Redis } from 'ioredis'
import { REDIS_KEYS, WEBSOCKET_OUTGOING_CHANNEL } from '../constants.js'
import { MatchResult } from '../types/matchmaking.js'

type Socket = SocketStream['socket']

type ConnectionMeta = {
  userId: string
}

type OutgoingMessage =
  | {
      targetType: 'connection'
      targets: string[]
      data: unknown
    }
  | {
      targetType: 'user'
      targets: string[]
      data: unknown
    }

export class WebSocketManager {
  private readonly fastify: FastifyInstance
  private readonly connections = new Map<string, Socket>()
  private readonly connectionMeta = new Map<string, ConnectionMeta>()
  private readonly userConnections = new Map<string, Set<string>>()
  private readonly publisher: Redis
  private readonly subscriber: Redis

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
    this.publisher = fastify.redis.duplicate()
    this.subscriber = fastify.redis.duplicate()
  }

  async initialize() {
    await this.subscriber.subscribe(WEBSOCKET_OUTGOING_CHANNEL)
    this.subscriber.on('message', (_, payload) => {
      try {
        const message = JSON.parse(payload) as OutgoingMessage
        this.handleOutgoingMessage(message)
      } catch (err) {
        this.fastify.log.error({ err, payload }, 'Failed to handle WS outgoing message')
      }
    })
  }

  async close() {
    await Promise.allSettled([
      this.publisher.quit(),
      this.subscriber.quit()
    ])
    this.connections.clear()
    this.connectionMeta.clear()
    this.userConnections.clear()
  }

  registerConnection(userId: string, socket: Socket): string {
    const connectionId = randomUUID()

    this.connections.set(connectionId, socket)
    this.connectionMeta.set(connectionId, { userId })

    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set())
    }
    this.userConnections.get(userId)!.add(connectionId)

    socket.on('close', async () => {
      await this.handleDisconnect(connectionId)
    })

    socket.on('error', async err => {
      this.fastify.log.warn({ err, connectionId }, 'WebSocket error detected')
      await this.handleDisconnect(connectionId)
    })

    return connectionId
  }

  async handleDisconnect(connectionId: string) {
    const socket = this.connections.get(connectionId)
    if (socket && socket.readyState === socket.OPEN) {
      try {
        socket.close()
      } catch {}
    }

    this.connections.delete(connectionId)
    const meta = this.connectionMeta.get(connectionId)
    if (meta) {
      const { userId } = meta
      this.connectionMeta.delete(connectionId)
      const set = this.userConnections.get(userId)
      if (set) {
        set.delete(connectionId)
        if (set.size === 0) {
          this.userConnections.delete(userId)
        }
      }

      // Clean Redis bookkeeping
      try {
        await this.fastify.redis.hdel(REDIS_KEYS.CONNECTION(connectionId), 'userId')
        await this.fastify.redis.hdel(REDIS_KEYS.PLAYER(userId), 'status', 'connectionId')
        await this.fastify.repositories.matchmaking.removePlayerFromMatchmaking(
          userId
        )
      } catch (err) {
        this.fastify.log.warn({ err, connectionId, userId }, 'Failed to clean Redis state after disconnect')
      }
    }
  }

  async sendToConnection(connectionId: string, data: unknown) {
    await this.publish({ targetType: 'connection', targets: [connectionId], data })
  }

  async sendToUsers(userIds: string[], data: unknown) {
    if (!userIds.length) return
    await this.publish({ targetType: 'user', targets: userIds, data })
  }

  async broadcastMatch(matchId: string, data: unknown) {
    const match = await this.fastify.repositories.match.getMatch(matchId)
    if (!match) {
      this.fastify.log.warn({ matchId }, 'broadcastMatch skipped - match not found')
      return
    }
    await this.sendToUsers(match.players ?? [], data)
  }

  async notifyMatchFound(match: MatchResult) {
    await this.sendToUsers(match.players ?? [], {
      type: 'match_found',
      matchId: match.matchId,
      players: match.players
    })
  }

  private async publish(message: OutgoingMessage) {
    await this.publisher.publish(
      WEBSOCKET_OUTGOING_CHANNEL,
      JSON.stringify(message)
    )
  }

  private handleOutgoingMessage(message: OutgoingMessage) {
    switch (message.targetType) {
      case 'connection':
        message.targets.forEach(connectionId => {
          const socket = this.connections.get(connectionId)
          if (socket && socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify(message.data))
          }
        })
        break
      case 'user':
        message.targets.forEach(userId => {
          const connectionIds = this.userConnections.get(userId)
          if (!connectionIds) return
          connectionIds.forEach(connectionId => {
            const socket = this.connections.get(connectionId)
            if (socket && socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify(message.data))
            }
          })
        })
        break
      default:
        this.fastify.log.warn({ message }, 'Unknown WS outgoing message type')
    }
  }
}

export type RegisteredConnection = {
  connectionId: string
  userId: string
}
