import { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { addConnection, removeConnection } from '../services/connection-manager.js';
import { parseAndHandle } from '../ws/actions.js';

type ManagedWebSocket = WebSocket & { id?: string };


//TODO: Extract user id from JWT, do not pass user id into the payload!
//TODO: Eventually move to AWS API Gateway - do not leverage local Fastify websocket
export default async function matchGatewayRoutes(fastify: FastifyInstance) {
  fastify.register(async function (fastify) {
    fastify.get(
      '/ws',
      {
        websocket: true,
      } as const,
      async (socket, req) => {
        const connectionId = uuidv4();
        const managedSocket = socket as ManagedWebSocket;
        managedSocket.id = connectionId;

        // Register the connection in the local Fastify instance
        addConnection(connectionId, managedSocket);

        // Handshake auth: accept JWT via query (?token=) or Authorization header
        let userId: string | null = null
        try {
          const url = new URL(req.url, 'http://localhost')
          const token = (url.searchParams.get('token') || req.headers['authorization']?.toString().replace(/^[Bb]earer\s+/, '') || '').trim()
          if (!token) throw new Error('missing_token')
          const decoded = fastify.jwt.verify(token) as { userId?: string }
          if (!decoded?.userId) throw new Error('missing_user')
          userId = decoded.userId
        } catch (err) {
          fastify.log.warn({ err, connectionId }, 'WebSocket auth failed')
          managedSocket.send(JSON.stringify({ type: 'error', message: 'unauthorized' }))
          managedSocket.close()
          return
        }

        fastify.log.info({ connectionId, userId }, 'Client connected to matchmaking')

        managedSocket.on('message', async message => {
          fastify.log.info({
            rawMessage: message.toString(),
            msg: 'Received raw message',
          });

          try {
            const data = JSON.parse(message.toString());
            fastify.log.info({
              connectionId,
              userId,
              action: data.action,
              msg: 'About to call parseAndHandle',
            });

            const result = await parseAndHandle(
              { fastify, connectionId, userId },
              data
            )

            fastify.log.info({
              connectionId,
              userId,
              action: data.action,
              hasResult: !!result,
              result: result,
              msg: 'parseAndHandle completed',
            });

            if (result) {
              const responseString = JSON.stringify(result);
              fastify.log.info({
                connectionId,
                userId,
                responseString,
                msg: 'Sending response to client',
              });
              managedSocket.send(responseString);
              fastify.log.info({
                connectionId,
                userId,
                msg: 'Response sent successfully',
              });
            } else { 
              fastify.log.warn({
                connectionId,
                userId,
                action: data.action,
                msg: 'No result from parseAndHandle, not sending response',
              });
            }
          } catch (error) {
            if (error instanceof Error) {
              fastify.log.error(
                {
                  error: error,
                  message: error.message,
                  stack: error.stack,
                  connectionId: connectionId,
                  inputMessage: message.toString(),
                },
                'Error handling WebSocket message'
              );
            } else {
              fastify.log.error(
                {
                  error: error,
                  connectionId: connectionId,
                  inputMessage: message.toString(),
                },
                'Unknown error type handling WebSocket message'
              );
            }

            managedSocket.send(
              JSON.stringify({
                type: 'error',
                message: 'Failed to process request',
              })
            );
          }
        });

        managedSocket.on('error', error => {
          fastify.log.error(
            { error: error, connectionId: connectionId },
            'WebSocket error'
          );
        });

        managedSocket.on('close', async () => {
          // Remove the connection from the local map on socket close
          removeConnection(connectionId);

          fastify.log.info(
            { connectionId, userId },
            `Client disconnected from matchmaking`
          );
          // TODO: Clean up player data from Redis when implementing disconnect handling
          // Use currentConnectionId here for cleanup
        });
      }
    );
  });
}
