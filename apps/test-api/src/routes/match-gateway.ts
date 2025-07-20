import { SocketStream } from '@fastify/websocket';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  addConnection,
  removeConnection,
} from '../services/connection-manager.js';
import {
  handleAssetDeselection,
  handleAssetSelection,
  handleReadyCheck,
} from '../services/match-actions.js';
import { joinMatchmakingWithSession } from '../services/matchmaking.js';

//TODO: Extract user id from JWT, do not pass user id into the payload!
//TODO: Eventually move to AWS API Gateway - do not leverage local Fastify websocket
export default async function matchGatewayRoutes(fastify: FastifyInstance) {
  fastify.register(async function (fastify) {
    fastify.get(
      '/ws',
      {
        websocket: true,
      } as const,
      (connection: SocketStream) => {
        const connectionId = uuidv4();

        (connection.socket as any).id = connectionId; // Use 'as any' or proper type augmentation

        // Register the connection in the local Fastify instance
        addConnection(connectionId, connection.socket as any);

        fastify.log.info(
          { connectionId: connectionId },
          `Client connected to matchmaking`
        );

        connection.socket.on('message', async message => {
          fastify.log.info({
            rawMessage: message.toString(),
            msg: 'Received raw message',
          });

          try {
            const data = JSON.parse(message.toString());
            fastify.log.info({
              parsedData: data,
              msg: 'Parsed message data',
            });

            switch (data.action) {
              case 'join_matchmaking': {
                fastify.log.info({
                  connectionId,
                  userId: data.userId,
                  msg: 'Processing join_matchmaking request',
                });

                try {
                  const playerAddedToQueue = await joinMatchmakingWithSession(
                    fastify,
                    data.userId,
                    connectionId
                  );
                  fastify.log.info({
                    playerAddedToQueue,
                    userId: data.userId,
                    connectionId,
                    msg: 'Join matchmaking result',
                  });
                  connection.socket.send(
                    JSON.stringify({
                      type: 'joined_queue',
                      playerAddedToQueue,
                      message: playerAddedToQueue
                        ? `user ${data.userId} joined matchmaking queue.`
                        : 'Failed to join queue',
                    })
                  );
                } catch (redisError) {
                  fastify.log.error({
                    redisError:
                      redisError instanceof Error
                        ? redisError.message
                        : redisError,
                    userId: data.userId,
                    msg: 'Redis operation failed',
                  });
                  throw redisError;
                }
                break;
              }

              case 'select_asset': {
                const { matchId, ticker, userId } = data.payload;

                //This is intentional in case of reconnection
                await fastify.redis.hset(
                  `player:${userId}`,
                  'connectionId',
                  connectionId
                );

                try {
                  await handleAssetSelection(fastify, userId, {
                    matchId,
                    ticker,
                  });

                  connection.socket.send(
                    JSON.stringify({
                      type: 'asset_selection_success',
                      matchId,
                      ticker,
                    })
                  );
                } catch (error) {
                  fastify.log.error({
                    error,
                    userId: data.userId,
                    matchId,
                    ticker,
                    msg: 'Error handling asset selection',
                  });
                  throw error;
                }
                break;
              }

              case 'deselect_asset': {
                const { matchId, ticker, userId } = data.payload;

                try {
                  await handleAssetDeselection(fastify, userId, {
                    matchId,
                    ticker,
                  });

                  connection.socket.send(
                    JSON.stringify({
                      type: 'asset_selection_success',
                      matchId,
                      ticker,
                    })
                  );
                } catch (error) {
                  fastify.log.error({
                    error,
                    userId: data.userId,
                    matchId,
                    ticker,
                    msg: 'Error handling asset selection',
                  });
                  throw error;
                }
                break;
              }

              case 'ready_check': {
                const { matchId, userId } = data;
                await handleReadyCheck(fastify, userId, matchId);
                break;
              }

              case 'cancel_matchmaking': {
                fastify.log.info(
                  { connectionId: connectionId },
                  'Processing ping request'
                );
                connection.socket.send(
                  JSON.stringify({
                    type: 'pong',
                    message: 'Server is alive',
                  })
                );
                break;
              }

              case 'ping': {
                fastify.log.info(
                  { connectionId: connectionId },
                  'Processing ping request'
                );
                connection.socket.send(
                  JSON.stringify({
                    type: 'pong',
                    message: 'Server is alive',
                  })
                );
                break;
              }

              default:
                connection.socket.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'Unknown action',
                  })
                );
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

            connection.socket.send(
              JSON.stringify({
                type: 'error',
                message: 'Failed to process request',
              })
            );
          }
        });

        connection.socket.on('error', error => {
          fastify.log.error(
            { error: error, connectionId: connectionId },
            'WebSocket error'
          );
        });

        connection.socket.on('close', async () => {
          const currentConnectionId = (connection.socket as any).id; // Retrieve the ID

          // Remove the connection from the local map on socket close
          removeConnection(currentConnectionId);

          fastify.log.info(
            { connectionId: currentConnectionId },
            `Client disconnected from matchmaking`
          );
          // TODO: Clean up player data from Redis when implementing disconnect handling
          // Use currentConnectionId here for cleanup
        });
      }
    );
  });
}
