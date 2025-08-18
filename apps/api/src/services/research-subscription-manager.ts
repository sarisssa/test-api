import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';

// In-memory mapping of tickers to active research WebSocket connections
const tickerSubscriptions = new Map<string, Set<string>>();

// Track which research connectionIds are subscribed to which tickers (for cleanup)
const connectionToTickers = new Map<string, Set<string>>();

// Map research connectionIds to WebSocket instances for direct communication
const researchConnections = new Map<string, WebSocket>();

const MONITORED_TICKERS_KEY = 'monitored_tickers';

export const addResearchConnection = (
  connectionId: string,
  socket: WebSocket
): void => {
  researchConnections.set(connectionId, socket);
  console.log(
    `Added research connection ${connectionId}. Active research connections: ${researchConnections.size}`
  );
};

export const removeResearchConnection = (connectionId: string): void => {
  const removed = researchConnections.delete(connectionId);
  if (removed) {
    console.log(
      `Removed research connection ${connectionId}. Active research connections: ${researchConnections.size}`
    );
  }
};

export const subscribeToTicker = async (
  fastify: FastifyInstance,
  ticker: string,
  connectionId: string
): Promise<void> => {
  if (!tickerSubscriptions.has(ticker)) {
    tickerSubscriptions.set(ticker, new Set());
  }
  tickerSubscriptions.get(ticker)!.add(connectionId);

  // Track tickers for this connection (for cleanup)
  if (!connectionToTickers.has(connectionId)) {
    connectionToTickers.set(connectionId, new Set());
  }
  connectionToTickers.get(connectionId)!.add(ticker);

  await fastify.redis.sadd(MONITORED_TICKERS_KEY, ticker);

  fastify.log.info({
    ticker,
    connectionId,
    subscriberCount: tickerSubscriptions.get(ticker)?.size || 0,
    msg: 'Added research subscription',
  });
};

const unsubscribeFromTicker = async (
  fastify: FastifyInstance,
  ticker: string,
  connectionId: string
): Promise<void> => {
  // Remove connection from ticker subscription pool
  const tickerSubs = tickerSubscriptions.get(ticker);
  if (tickerSubs) {
    tickerSubs.delete(connectionId);

    // If no more subscribers for this ticker, start cleanup timer
    if (tickerSubs.size === 0) {
      tickerSubscriptions.delete(ticker);
      scheduleTickerCleanup(fastify, ticker);
    }
  }

  // Remove ticker from connection tracking
  const connTickers = connectionToTickers.get(connectionId);
  if (connTickers) {
    connTickers.delete(ticker);
    if (connTickers.size === 0) {
      connectionToTickers.delete(connectionId);
    }
  }

  fastify.log.info({
    ticker,
    connectionId,
    remainingSubscribers: tickerSubs?.size || 0,
    msg: 'Removed research subscription',
  });
};

export const cleanupConnectionSubscriptions = async (
  fastify: FastifyInstance,
  connectionId: string
): Promise<void> => {
  const userTickers = connectionToTickers.get(connectionId);
  if (userTickers) {
    // Unsubscribe from all tickers this connection was watching
    for (const ticker of userTickers) {
      await unsubscribeFromTicker(fastify, ticker, connectionId);
    }
  }

  // Remove from research connections map
  removeResearchConnection(connectionId);
};

const scheduleTickerCleanup = (
  fastify: FastifyInstance,
  ticker: string
): void => {
  const CLEANUP_DELAY_MS = 60000; // 60 seconds grace period

  setTimeout(async () => {
    if (
      !tickerSubscriptions.has(ticker) ||
      tickerSubscriptions.get(ticker)?.size === 0
    ) {
      await fastify.redis.srem(MONITORED_TICKERS_KEY, ticker);
      fastify.log.info({
        ticker,
        msg: 'Removed ticker from monitored_tickers after grace period',
      });
    }
  }, CLEANUP_DELAY_MS);
};

// Broadcast price updates to all subscribers of a ticker
export const broadcastPriceUpdate = (
  fastify: FastifyInstance,
  ticker: string,
  priceData: { price: number; lastUpdated: string }
): void => {
  const subscribers = tickerSubscriptions.get(ticker);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  const message = JSON.stringify({
    type: 'price_update',
    ticker,
    price: priceData.price,
    lastUpdated: priceData.lastUpdated,
  });

  let successfulBroadcasts = 0;
  const deadConnections: string[] = [];

  for (const connectionId of subscribers) {
    const socket = researchConnections.get(connectionId);

    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(message);
        successfulBroadcasts++;
      } catch (error) {
        fastify.log.warn({
          error,
          connectionId,
          ticker,
          msg: 'Failed to send price update',
        });
        deadConnections.push(connectionId);
      }
    } else {
      deadConnections.push(connectionId);
    }
  }

  // Clean up dead connections
  for (const deadConnectionId of deadConnections) {
    cleanupConnectionSubscriptions(fastify, deadConnectionId);
  }

  if (successfulBroadcasts > 0) {
    fastify.log.info({
      ticker,
      subscribers: successfulBroadcasts,
      msg: 'Broadcasted price update to research subscribers',
    });
  }
};

export const getTickerSubscribers = (ticker: string): string[] => {
  return Array.from(tickerSubscriptions.get(ticker) || []);
};

export const getSubscribedTickers = (): string[] => {
  return Array.from(tickerSubscriptions.keys());
};

export const getSubscriptionStats = () => {
  const stats = new Map<string, number>();
  tickerSubscriptions.forEach((subscribers, ticker) => {
    stats.set(ticker, subscribers.size);
  });
  return stats;
};
