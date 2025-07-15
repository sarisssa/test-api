import { SocketStream } from '@fastify/websocket';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { joinMatchmakingWithSession } from '../services/matchmaking.js';

export default async function matchmakingRoutes(fastify: FastifyInstance) {
  fastify.register(async function (fastify) {
    fastify.get(
      '/ws',
      {
        websocket: true,
      } as const,
      (connection: SocketStream) => {
        const connectionId = uuidv4();

        (connection.socket as any).id = connectionId; // Use 'as any' or proper type augmentation

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
                  //TODO: Fold into service layer
                  await fastify.redis.hset(`player:${data.userId}`, {
                    connectionId,
                    status: 'matchmaking',
                    joinedAt: Date.now(),
                  });

                  await fastify.redis.hset(`connection:${connectionId}`, {
                    userId: data.userId,
                  });

                  const success = await joinMatchmakingWithSession(
                    fastify,
                    data.userId
                  );
                  fastify.log.info({
                    success,
                    userId: data.userId,
                    connectionId,
                    msg: 'Join matchmaking result',
                  });
                  connection.socket.send(
                    JSON.stringify({
                      type: 'joined_queue',
                      success,
                      message: success
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

              default:
                fastify.log.info(
                  { action: data.action, connectionId: connectionId },
                  'Received unknown action'
                );
                connection.socket.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'Unknown action',
                  })
                );
            }
          } catch (error) {
            // Ensure full error details are logged as metadata
            if (error instanceof Error) {
              fastify.log.error(
                {
                  error: error, // Log the error object itself
                  message: error.message,
                  stack: error.stack,
                  connectionId: connectionId,
                  // Optionally, if `data` parsing failed, it might be undefined, so check
                  inputMessage: message.toString(),
                },
                'Error handling WebSocket message'
              );
            } else {
              // Handle cases where 'error' might not be an instance of Error
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
          // Log WebSocket error with connectionId and full error object
          fastify.log.error(
            { error: error, connectionId: connectionId },
            'WebSocket error'
          );
        });

        connection.socket.on('close', async () => {
          const currentConnectionId = (connection.socket as any).id; // Retrieve the ID
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
