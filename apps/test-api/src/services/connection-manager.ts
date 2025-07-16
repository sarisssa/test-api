import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { WEBSOCKET_OUTGOING_CHANNEL } from '../constants.js';

// Local map to store active WebSocket connections for this specific Fargate task
const activeConnections = new Map<string, WebSocket>();

let subRedis: Redis | null = null;
let isSubscriberRunning = false;

export const addConnection = (
  connectionId: string,
  socket: WebSocket
): void => {
  activeConnections.set(connectionId, socket);
  console.log(
    `Added connection ${connectionId}. Total connections: ${activeConnections.size}`
  );
};

export const removeConnection = (connectionId: string): void => {
  const removed = activeConnections.delete(connectionId);
  if (removed) {
    console.log(
      `Removed connection ${connectionId}. Total connections: ${activeConnections.size}`
    );
  }
};

export const getConnection = (connectionId: string): WebSocket | undefined => {
  return activeConnections.get(connectionId);
};

export const getConnectionCount = (): number => {
  return activeConnections.size;
};

export const startWebSocketMessageSubscriber = async (
  fastify: FastifyInstance
): Promise<void> => {
  if (isSubscriberRunning) {
    fastify.log.warn('WebSocket message subscriber is already running.');
    return;
  }

  isSubscriberRunning = true;
  fastify.log.info('Starting WebSocket message subscriber...');

  subRedis = new Redis(fastify.config.REDIS_URL);

  subRedis.on('message', async (channel: string, message: string) => {
    if (channel === WEBSOCKET_OUTGOING_CHANNEL) {
      try {
        const messageData = JSON.parse(message);
        const { targetConnectionId, data } = messageData;

        if (!targetConnectionId || !data) {
          fastify.log.warn({
            message: messageData,
            msg: 'Invalid message format - missing targetConnectionId or data',
          });
          return;
        }

        // Assess if this Fargate task has the connection to the client
        const clientConnection = getConnection(targetConnectionId);

        if (clientConnection) {
          fastify.log.info({
            targetConnectionId,
            messageType: data.type,
            msg: 'Delivering message to WebSocket client on this task',
          });

          clientConnection.send(JSON.stringify(data));
        } else {
          fastify.log.info({
            targetConnectionId,
            msg: 'Connection not found on this task - ignoring (normal in multi-task setup)',
          });
        }
      } catch (parseError) {
        fastify.log.info({
          parseError,
          message,
          msg: 'Failed to parse WebSocket message from Redis',
        });
      }
    }
  });

  subRedis.on('error', error => {
    if (isSubscriberRunning) {
      fastify.log.error({ error, msg: 'Redis subscriber error' });
    }
  });

  // Subscribe to the websocket outgoing channel
  await subRedis.subscribe(WEBSOCKET_OUTGOING_CHANNEL);
  fastify.log.info(
    `Subscribed to Redis channel: ${WEBSOCKET_OUTGOING_CHANNEL}`
  );
};
