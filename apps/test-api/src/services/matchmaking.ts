import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { WebSocket } from 'ws';

const MATCHMAKING_PLAYER_QUEUE_ZSET = 'matchmaking:players:zset';
const MATCHMAKING_JOB_QUEUE_LIST = 'matchmaking:jobs:list';
const WEBSOCKET_OUTGOING_CHANNEL = 'websocket:outgoing_messages';

// Local map to store active WebSocket connections for this specific Fargate task
const activeConnections = new Map<string, WebSocket>();

let subRedis: Redis | null = null;
let isSubscriberRunning = false;

export const initMatchmaking = async (
  fastify: FastifyInstance
): Promise<void> => {
  await startWebSocketMessageSubscriber(fastify);

  fastify.log.info(
    'Matchmaking service initialized - queues will be created on first use'
  );
};

export const joinMatchmakingWithSession = async (
  fastify: FastifyInstance,
  userId: string,
  connectionId: string
): Promise<boolean> => {
  try {
    const timestamp = Date.now();

    //Ensure atomicity of operations
    const multi = fastify.redis.multi();

    multi.hset(`player:${userId}`, {
      connectionId,
      status: 'matchmaking',
      joinedAt: Date.now(),
    });

    multi.hset(`connection:${connectionId}`, {
      userId,
    });

    fastify.log.info({
      queueKey: MATCHMAKING_PLAYER_QUEUE_ZSET,
      nxOption: 'NX',
      score: timestamp,
      member: userId,
      msg: 'ZADD arguments',
    });

    multi.zadd(
      MATCHMAKING_PLAYER_QUEUE_ZSET,
      'NX', // Only add a new player if not already in queue
      timestamp,
      userId
    );

    const message = JSON.stringify({
      userId,
      timestamp,
      action: 'player_joined_matchmaking',
      attempts: 0,
    });

    fastify.log.info({
      jobQueueKey: MATCHMAKING_JOB_QUEUE_LIST,
      message: message,
      msg: 'LPUSH arguments',
    });

    multi.lpush(MATCHMAKING_JOB_QUEUE_LIST, message);
    // results will be [hsetPlayer, hsetConnection, zadd, lpush]
    const results = await multi.exec();

    const zaddResult = results?.[2]?.[1]; // Third command (zadd)
    const lpushResult = results?.[1]?.[1];

    fastify.log.info({
      userId,
      zaddResult: zaddResult,
      lpushResult: lpushResult,
      timestamp,
      queueKey: MATCHMAKING_PLAYER_QUEUE_ZSET,
      jobQueueKey: MATCHMAKING_JOB_QUEUE_LIST,
      fullResults: results,
      msg: 'Redis operation results',
    });

    if (zaddResult === 1) {
      fastify.log.info({
        userId,
        timestamp,
        queueKey: MATCHMAKING_PLAYER_QUEUE_ZSET,
        jobQueueKey: MATCHMAKING_JOB_QUEUE_LIST,
        msg: 'Player successfully added to matchmaking',
      });
      return true;
    } else {
      fastify.log.info({
        userId,
        zaddResult,
        msg: 'Player was NOT added (already exists or other reason)',
      });
      return false;
    }
  } catch (error) {
    fastify.log.error('Error adding player to matchmaking queue:', {
      userId,
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
};

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
        const socket = getConnection(targetConnectionId);

        if (socket) {
          // This task has the connection to the client - send the message
          fastify.log.info({
            targetConnectionId,
            messageType: data.type,
            msg: 'Delivering message to WebSocket client on this task',
          });

          socket.send(JSON.stringify(data));
        } else {
          // Connection not on this task - another task will handle it
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
