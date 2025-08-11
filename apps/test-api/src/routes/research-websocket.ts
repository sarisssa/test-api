import { SocketStream } from '@fastify/websocket';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { validateTickerSymbol } from '../services/asset.js';
import {
  addResearchConnection,
  cleanupConnectionSubscriptions,
  subscribeToTicker,
} from '../services/research-subscription-manager.js';

export default async function researchWebSocketRoutes(
  fastify: FastifyInstance
) {
  fastify.register(async function (fastify) {
    fastify.get(
      '/research-ws/:ticker',
      {
        websocket: true,
      } as const,
      async (connection: SocketStream, req) => {
        const connectionId = uuidv4();
        const ticker = (req.params as { ticker: string }).ticker;

        addResearchConnection(connectionId, connection.socket as any);

        fastify.log.info(
          { connectionId, ticker },
          `Research WebSocket client connected for ticker`
        );

        try {
          await validateTickerSymbol(fastify, ticker);

          await subscribeToTicker(fastify, ticker, connectionId);

          connection.socket.send(
            JSON.stringify({
              type: 'subscribed',
              ticker,
              message: `Automatically subscribed to ${ticker} price updates`,
            })
          );

          fastify.log.info({
            connectionId,
            ticker,
            msg: 'Auto-subscribed to ticker from URL',
          });
        } catch (error) {
          fastify.log.error({
            error,
            ticker,
            connectionId,
            msg: 'Error auto-subscribing to ticker',
          });

          connection.socket.send(
            JSON.stringify({
              type: 'error',
              message: `Invalid ticker: ${ticker}`,
            })
          );

          // Close connection if ticker is invalid
          connection.socket.close();
          return;
        }

        connection.socket.on('message', async message => {
          try {
            const data = JSON.parse(message.toString());

            if (data.action === 'ping') {
              connection.socket.send(
                JSON.stringify({
                  type: 'pong',
                  message: 'Research WebSocket is alive',
                })
              );
            } else {
              fastify.log.warn({
                connectionId,
                ticker,
                action: data.action,
                msg: 'Received unexpected message on research WebSocket',
              });
            }
          } catch (error) {
            fastify.log.warn({
              error,
              connectionId,
              ticker,
              inputMessage: message.toString(),
              msg: 'Error parsing research WebSocket message',
            });
          }
        });

        connection.socket.on('error', error => {
          fastify.log.error(
            { error, connectionId },
            'Research WebSocket error'
          );
        });

        connection.socket.on('close', async () => {
          fastify.log.info(
            { connectionId },
            `Research WebSocket client disconnected`
          );

          try {
            await cleanupConnectionSubscriptions(fastify, connectionId);
          } catch (error) {
            fastify.log.error({
              error,
              connectionId,
              msg: 'Error cleaning up research subscriptions on disconnect',
            });
          }
        });
      }
    );
  });
}
