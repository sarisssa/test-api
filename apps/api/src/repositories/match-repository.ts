import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  MAX_ASSETS_PER_PLAYER,
  MAX_CHAT_MESSAGES_PER_PLAYER,
  REDIS_KEYS,
} from '../constants.js';
import { DynamoDBMatchItem } from '../models/match.js';
import { PlayerAsset } from '../types/match.js';
import { MatchResult } from '../types/matchmaking.js';

const ASSET_SELECTION_DURATION = 2 * 60 * 1000;
//TODO: Remove hard codeed match duration
const MATCH_DURATION_MINUTES = 60;

export const createMatchRepository = (fastify: FastifyInstance) => {
  const dynamodb = DynamoDBDocumentClient.from(
    fastify.dynamodb as DynamoDBClient
  );
  const { redis, log: logger } = fastify;

  const resolveMatchTableName = () => fastify.config.DYNAMODB_TABLE_NAME;

  const persistNewMatch = async (players: string[]): Promise<MatchResult> => {
    const matchId = uuidv4();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const assetSelectionEndedAtMs = nowMs + ASSET_SELECTION_DURATION;
    const assetSelectionEndedAtIso = new Date(
      assetSelectionEndedAtMs
    ).toISOString();
    const initialMatchTentativeEndTimeIso = new Date(
      assetSelectionEndedAtMs + MATCH_DURATION_MINUTES * 60 * 1000
    ).toISOString();

    const match: MatchResult = {
      matchId,
      players,
      createdAt: nowMs,
    };

    try {
      const [player1Info, player2Info] = await Promise.all([
        fastify.repositories.user.getUserById(players[0]),
        fastify.repositories.user.getUserById(players[1]),
      ]);

      if (!player1Info || !player2Info) {
        throw new Error('One or both players not found');
      }

      const cacheUpdatePromise = redis.hset(REDIS_KEYS.MATCH(matchId), {
        players: JSON.stringify(players),
        createdAt: match.createdAt,
        status: 'asset_selection',
      });

      const playerAssets = players.reduce<
        Record<string, { assets: PlayerAsset[] }>
      >((acc, playerId) => {
        acc[playerId] = { assets: [] };
        return acc;
      }, {});

      const matchItemPromise = dynamodb.send(
        new PutCommand({
          TableName: resolveMatchTableName(),
          Item: {
            pk: `MATCH#${matchId}`,
            sk: 'DETAILS',
            EntityType: 'Match',
            matchId,
            players,
            status: 'asset_selection',
            createdAt: nowIso,
            assetSelectionStartedAt: nowIso,
            assetSelectionEndedAt: assetSelectionEndedAtIso,
            playerAssets,
          },
        })
      );

      const player1MatchItemPromise = dynamodb.send(
        new PutCommand({
          TableName: resolveMatchTableName(),
          Item: {
            pk: `USER#${players[0]}`,
            sk: `MATCH#${matchId}`,
            EntityType: 'PlayerMatch',
            id: matchId,
            opponentId: players[1],
            opponentUsername: player2Info.username,
            result: 'pending',
            wagerAmount: 20,
            duration: MATCH_DURATION_MINUTES,
            category: 'stock',
            createdAt: nowIso,
            tentativeEndTime: initialMatchTentativeEndTimeIso,
          },
        })
      );

      const player2MatchItemPromise = dynamodb.send(
        new PutCommand({
          TableName: resolveMatchTableName(),
          Item: {
            pk: `USER#${players[1]}`,
            sk: `MATCH#${matchId}`,
            EntityType: 'PlayerMatch',
            id: matchId,
            opponentId: players[0],
            opponentUsername: player1Info.username,
            result: 'pending',
            wagerAmount: 20,
            duration: MATCH_DURATION_MINUTES,
            category: 'stock',
            createdAt: nowIso,
            tentativeEndTime: initialMatchTentativeEndTimeIso,
          },
        })
      );

      await Promise.all([
        cacheUpdatePromise,
        matchItemPromise,
        player1MatchItemPromise,
        player2MatchItemPromise,
      ]);

      logger.info({
        matchId,
        msg: 'Match and PlayerMatchItems created successfully in both Redis and DynamoDB',
      });

      return match;
    } catch (error) {
      logger.error({
        error,
        matchId,
        players,
        msg: 'Error creating match',
      });
      throw error;
    }
  };

  const getMatch = async (
    matchId: string
  ): Promise<DynamoDBMatchItem | undefined> => {
    try {
      const cachedMatch = await redis.hgetall(REDIS_KEYS.MATCH(matchId));

      if (
        cachedMatch &&
        cachedMatch.playerAssets &&
        cachedMatch.players &&
        cachedMatch.status
      ) {
        logger.info({ matchId, msg: 'Match found in Redis cache' });
        return {
          pk: `MATCH#${matchId}`,
          sk: 'DETAILS',
          EntityType: 'Match',
          matchId,
          players: JSON.parse(cachedMatch.players),
          status: cachedMatch.status,
          createdAt: cachedMatch.createdAt,
          playerAssets: JSON.parse(cachedMatch.playerAssets),
          assetSelectionStartedAt: cachedMatch.assetSelectionStartedAt,
          assetSelectionEndedAt: cachedMatch.assetSelectionEndedAt || '',
          matchStartedAt: cachedMatch.matchStartedAt || '',
        } as DynamoDBMatchItem;
      }

      const matchResult = await dynamodb.send(
        new GetCommand({
          TableName: resolveMatchTableName(),
          Key: { pk: `MATCH#${matchId}`, sk: 'DETAILS' },
        })
      );

      if (!matchResult.Item) {
        logger.warn({
          matchId,
          msg: 'Match not found in DynamoDB',
          tableUsed: 'WageTable',
        });
        return undefined;
      }

      const match = matchResult.Item as DynamoDBMatchItem;

      // Cache the complete result from DynamoDB
      await redis.hset(REDIS_KEYS.MATCH(matchId), {
        players: JSON.stringify(match.players),
        status: match.status,
        createdAt: match.createdAt,
        playerAssets: JSON.stringify(match.playerAssets),
        assetSelectionStartedAt: match.assetSelectionStartedAt,
        assetSelectionEndedAt: match.assetSelectionEndedAt || '',
        matchStartedAt: match.matchStartedAt || '',
      });

      logger.info({
        matchId,
        msg: 'Match cached in Redis after DynamoDB fetch',
      });

      return match;
    } catch (error) {
      logger.error({
        error,
        matchId,
        msg: 'Error fetching match from DynamoDB',
      });
      throw error;
    }
  };

  const persistMatchAsset = async (
    matchId: string,
    userId: string,
    asset: PlayerAsset
  ): Promise<void> => {
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: resolveMatchTableName(),
          Key: { pk: `MATCH#${matchId}`, sk: 'DETAILS' },
          ConditionExpression:
            'attribute_exists(pk) AND attribute_exists(sk) AND #status = :assetStatus AND size(playerAssets.#userId.assets) < :maxAssets',
          UpdateExpression:
            'SET playerAssets.#userId.assets = list_append(playerAssets.#userId.assets, :newAsset)',
          ExpressionAttributeNames: {
            '#userId': userId,
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':assetStatus': 'asset_selection',
            ':maxAssets': MAX_ASSETS_PER_PLAYER,
            ':newAsset': [asset],
          },
        })
      );

      await redis.del(REDIS_KEYS.MATCH(matchId));
      logger.info({
        matchId,
        userId,
        asset: asset.ticker,
        msg: 'Asset persisted to match',
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        throw new Error('Cannot persist asset: match status invalid');
      }
      throw error;
    }
  };

  const removeMatchAsset = async (
    matchId: string,
    userId: string,
    assetIndex: number
  ): Promise<void> => {
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: resolveMatchTableName(),
          Key: { pk: `MATCH#${matchId}`, sk: 'DETAILS' },
          ConditionExpression:
            'attribute_exists(pk) AND attribute_exists(sk) AND #status = :assetStatus',
          UpdateExpression: `REMOVE playerAssets.#userId.assets[${assetIndex}]`,
          ExpressionAttributeNames: {
            '#userId': userId,
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':assetStatus': 'asset_selection',
          },
        })
      );

      await redis.del(REDIS_KEYS.MATCH(matchId));
      logger.info({
        matchId,
        userId,
        assetIndex,
        msg: 'Asset removed from match successfully',
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        throw new Error('Cannot remove asset: match status invalid');
      }
      throw error;
    }
  };

  const persistPlayerReadyStatus = async (
    matchId: string,
    userId: string
  ): Promise<DynamoDBMatchItem> => {
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: resolveMatchTableName(),
          Key: { pk: `MATCH#${matchId}`, sk: 'DETAILS' },
          UpdateExpression: 'SET playerAssets.#userId.readyAt = :now',
          ExpressionAttributeNames: { '#userId': userId },
          ExpressionAttributeValues: { ':now': new Date().toISOString() },
        })
      );

      await redis.del(REDIS_KEYS.MATCH(matchId));

      const updatedMatch = await getMatch(matchId);
      if (!updatedMatch) {
        throw new Error(
          'Failed to fetch updated match after ready status update'
        );
      }

      logger.info({
        matchId,
        userId,
        msg: 'Player ready status updated successfully',
      });

      return updatedMatch;
    } catch (error) {
      logger.error({
        error,
        matchId,
        userId,
        msg: 'Error updating player ready status',
      });
      throw error;
    }
  };

  const transitionMatchToInProgress = async (
    matchId: string,
    params: {
      matchStartTimeIso: string;
      matchTentativeEndTimeIso: string;
      settlementExecutionArn?: string;
    }
  ): Promise<void> => {
    try {
      const tableName = resolveMatchTableName();

      // Get match to retrieve players
      const match = await getMatch(matchId);
      if (!match) {
        throw new Error(`Match ${matchId} not found`);
      }

      const updateExpressions = [
        '#status = :newStatus',
        'matchStartedAt = :now',
        'matchTentativeEndTime = :tentativeEndTime',
      ];

      const expressionAttributeNames: Record<string, string> = {
        '#status': 'status',
      };

      const expressionAttributeValues: Record<string, unknown> = {
        ':newStatus': 'in_progress',
        ':expectedStatus': 'asset_selection',
        ':now': params.matchStartTimeIso,
        ':tentativeEndTime': params.matchTentativeEndTimeIso,
      };

      if (params.settlementExecutionArn) {
        updateExpressions.push('matchSettlementExecutionArn = :executionArn');
        expressionAttributeValues[':executionArn'] =
          params.settlementExecutionArn;
      }

      const updatePromises = [];

      // Update main Match item
      updatePromises.push(
        dynamodb.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: `MATCH#${matchId}`, sk: 'DETAILS' },
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ConditionExpression:
              'attribute_exists(pk) AND attribute_exists(sk) AND #status = :expectedStatus',
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
          })
        )
      );

      // Update PlayerMatchItem records for both players
      for (const playerId of match.players) {
        updatePromises.push(
          dynamodb.send(
            new UpdateCommand({
              TableName: tableName,
              Key: {
                pk: `USER#${playerId}`,
                sk: `MATCH#${matchId}`,
              },
              UpdateExpression:
                'SET startedAt = :startedAt, tentativeEndTime = :tentativeEndTime',
              ConditionExpression:
                'attribute_exists(pk) AND attribute_exists(sk)',
              ExpressionAttributeValues: {
                ':startedAt': params.matchStartTimeIso,
                ':tentativeEndTime': params.matchTentativeEndTimeIso,
              },
            })
          )
        );
      }

      await Promise.all(updatePromises);
      await redis.del(REDIS_KEYS.MATCH(matchId));
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        throw error;
      }
      logger.error({
        error,
        matchId,
        msg: 'Error starting match in DynamoDB',
      });
      throw error;
    }
  };

  const transitionMatchToAssetSelection = async (
    matchId: string
  ): Promise<void> => {
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: resolveMatchTableName(),
          Key: { pk: `MATCH#${matchId}`, sk: 'DETAILS' },
          UpdateExpression: 'SET #status = :status',
          ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'asset_selection',
          },
        })
      );
      await redis.del(REDIS_KEYS.MATCH(matchId));

      logger.info({
        matchId,
        msg: 'Match reverted to asset selection status',
      });
    } catch (error) {
      logger.error({
        error,
        matchId,
        msg: 'Error reverting match to asset selection status',
      });
      throw error;
    }
  };

  const updateMatchTentativeEndTime = async (
    matchId: string,
    params: {
      matchTentativeEndTimeIso: string;
      settlementExecutionArn?: string;
    }
  ): Promise<void> => {
    const tableName = resolveMatchTableName();

    // Get match to retrieve players
    const match = await getMatch(matchId);
    if (!match) {
      throw new Error(`Match ${matchId} not found`);
    }

    const expressions = ['matchTentativeEndTime = :tentativeEndTime'];

    const expressionAttributeValues: Record<string, unknown> = {
      ':tentativeEndTime': params.matchTentativeEndTimeIso,
    };

    if (params.settlementExecutionArn) {
      expressions.push('matchSettlementExecutionArn = :executionArn');
      expressionAttributeValues[':executionArn'] =
        params.settlementExecutionArn;
    }

    const updatePromises = [];

    // Update main Match item
    updatePromises.push(
      dynamodb.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { pk: `MATCH#${matchId}`, sk: 'DETAILS' },
          UpdateExpression: `SET ${expressions.join(', ')}`,
          ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
          ExpressionAttributeValues: expressionAttributeValues,
        })
      )
    );

    // Update PlayerMatchItem records for both players
    for (const playerId of match.players) {
      updatePromises.push(
        dynamodb.send(
          new UpdateCommand({
            TableName: tableName,
            Key: {
              pk: `USER#${playerId}`,
              sk: `MATCH#${matchId}`,
            },
            UpdateExpression: 'SET tentativeEndTime = :tentativeEndTime',
            ConditionExpression:
              'attribute_exists(pk) AND attribute_exists(sk)',
            ExpressionAttributeValues: {
              ':tentativeEndTime': params.matchTentativeEndTimeIso,
            },
          })
        )
      );
    }

    await Promise.all(updatePromises);
    await redis.del(REDIS_KEYS.MATCH(matchId));
  };

  const setAssetInitialPricing = async (
    matchId: string,
    userId: string,
    assetIndex: number,
    initialPrice: number,
    shares: number
  ): Promise<void> => {
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: resolveMatchTableName(),
          Key: { pk: `MATCH#${matchId}`, sk: 'DETAILS' },
          UpdateExpression: `SET playerAssets.#userId.assets[${assetIndex}].initialPrice = :initialPrice, playerAssets.#userId.assets[${assetIndex}].shares = :shares`,
          ExpressionAttributeNames: {
            '#userId': userId,
          },
          ExpressionAttributeValues: {
            ':initialPrice': initialPrice,
            ':shares': shares,
          },
        })
      );

      await redis.del(REDIS_KEYS.MATCH(matchId));
      logger.info({
        matchId,
        userId,
        assetIndex,
        initialPrice,
        shares,
        msg: 'Asset updated with initial price and shares',
      });
    } catch (error) {
      logger.error({
        error,
        matchId,
        userId,
        assetIndex,
        msg: 'Error updating asset with price and shares',
      });
      throw error;
    }
  };

  const countInProgressMatchesForUser = async (
    userId: string
  ): Promise<number> => {
    try {
      const { Count } = await dynamodb.send(
        new ScanCommand({
          TableName: resolveMatchTableName(),
          FilterExpression:
            '#entity = :match AND sk = :details AND contains(#players, :uid) AND #status = :inprog',
          ExpressionAttributeNames: {
            '#entity': 'EntityType',
            '#players': 'players',
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':match': 'Match',
            ':details': 'DETAILS',
            ':uid': userId,
            ':inprog': 'in_progress',
          },
          Select: 'COUNT',
        })
      );
      return Count ?? 0;
    } catch (error) {
      logger.error({
        error,
        userId,
        msg: 'Error counting in-progress matches for user',
      });
      return 0;
    }
  };

  const addChatMessage = async (
    matchId: string,
    senderId: string,
    username: string,
    messageId: string
  ): Promise<void> => {
    const message = {
      senderId,
      username,
      messageId,
      createdAt: new Date().toISOString(),
    };

    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: resolveMatchTableName(),
          Key: { pk: `MATCH#${matchId}`, sk: 'DETAILS' },
          UpdateExpression: `
          SET chatMessages = list_append(if_not_exists(chatMessages, :empty), :msg),
              chatMessageCounts.#senderId = if_not_exists(chatMessageCounts.#senderId, :zero) + :one
        `,
          ConditionExpression: `
          attribute_exists(pk) AND 
          attribute_exists(sk) AND
          #status = :inProgress AND
          if_not_exists(chatMessageCounts.#senderId, :zero) < :maxPerPlayer
        `,
          ExpressionAttributeNames: {
            '#senderId': senderId,
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':msg': [message],
            ':empty': [],
            ':zero': 0,
            ':one': 1,
            ':maxPerPlayer': MAX_CHAT_MESSAGES_PER_PLAYER,
            ':inProgress': 'in_progress',
          },
        })
      );

      await redis.del(REDIS_KEYS.MATCH(matchId));

      logger.info({
        matchId,
        senderId,
        messageId,
        msg: 'Chat message added successfully',
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        throw new Error(
          'Cannot send message: limit reached or match not in progress'
        );
      }
      logger.error({
        error,
        matchId,
        senderId,
        messageId,
        msg: 'Error adding chat message',
      });
      throw error;
    }
  };

  const completeMatchWithOutcome = async (
    matchId: string,
    params: {
      completionReason: 'time_expired' | 'forfeited' | 'manual';
      matchEndedAtIso: string;
      winnerId?: string;
      loserId?: string;
      finalScores?: Record<string, number>;
      expectedStatus?: 'asset_selection' | 'in_progress' | 'completed';
    }
  ): Promise<DynamoDBMatchItem | undefined> => {
    const tableName = resolveMatchTableName();

    const existingMatch = await getMatch(matchId);
    if (!existingMatch) {
      throw new Error(`Match ${matchId} not found`);
    }

    const setExpressions = [
      '#status = :completed',
      'matchEndedAt = :matchEndedAt',
      '#completionReason = :completionReason',
    ];

    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
      '#completionReason': 'completionReason',
    };

    const expressionAttributeValues: Record<string, unknown> = {
      ':completed': 'completed',
      ':matchEndedAt': params.matchEndedAtIso,
      ':completionReason': params.completionReason,
      ':expectedStatus': params.expectedStatus ?? 'in_progress',
    };

    if (params.winnerId) {
      expressionAttributeNames['#winner'] = 'winner';
      expressionAttributeValues[':winner'] = params.winnerId;
      setExpressions.push('#winner = :winner');
    }

    if (params.loserId) {
      expressionAttributeNames['#loser'] = 'loser';
      expressionAttributeValues[':loser'] = params.loserId;
      setExpressions.push('#loser = :loser');
    }

    if (params.finalScores) {
      expressionAttributeNames['#finalScores'] = 'finalScores';
      expressionAttributeValues[':finalScores'] = params.finalScores;
      setExpressions.push('#finalScores = :finalScores');
    }

    const removeExpressions = ['matchSettlementExecutionArn'];

    try {
      const updatePromises = [];

      // Update the main match item
      updatePromises.push(
        dynamodb.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: `MATCH#${matchId}`, sk: 'DETAILS' },
            UpdateExpression: `SET ${setExpressions.join(', ')}${
              removeExpressions.length > 0
                ? ` REMOVE ${removeExpressions.join(', ')}`
                : ''
            }`,
            ConditionExpression:
              'attribute_exists(pk) AND attribute_exists(sk) AND #status = :expectedStatus',
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
          })
        )
      );

      // Update PlayerMatchItem records for both players
      for (const playerId of existingMatch.players) {
        const playerUpdateExpressions = [
          '#result = :result',
          'endedAt = :endedAt',
        ];

        const playerExpressionAttributeNames: Record<string, string> = {
          '#result': 'result',
        };

        const playerExpressionAttributeValues: Record<string, unknown> = {
          ':result':
            playerId === params.winnerId
              ? 'win'
              : playerId === params.loserId
                ? 'loss'
                : 'pending',
          ':endedAt': params.matchEndedAtIso,
        };

        // Add performance percentage if available
        if (params.finalScores && params.finalScores[playerId] !== undefined) {
          playerUpdateExpressions.push('performancePercentage = :performance');
          playerExpressionAttributeValues[':performance'] =
            params.finalScores[playerId];
        }

        // Add opponent's performance percentage if available
        const opponentId = existingMatch.players.find(p => p !== playerId);
        if (
          opponentId &&
          params.finalScores &&
          params.finalScores[opponentId] !== undefined
        ) {
          playerUpdateExpressions.push(
            'opponentPerformancePercentage = :opponentPerformance'
          );
          playerExpressionAttributeValues[':opponentPerformance'] =
            params.finalScores[opponentId];
        }

        updatePromises.push(
          dynamodb.send(
            new UpdateCommand({
              TableName: tableName,
              Key: {
                pk: `USER#${playerId}`,
                sk: `MATCH#${matchId}`,
              },
              UpdateExpression: `SET ${playerUpdateExpressions.join(', ')}`,
              ConditionExpression:
                'attribute_exists(pk) AND attribute_exists(sk)',
              ExpressionAttributeNames: playerExpressionAttributeNames,
              ExpressionAttributeValues: playerExpressionAttributeValues,
            })
          )
        );
      }

      await Promise.all(updatePromises);
      await redis.del(REDIS_KEYS.MATCH(matchId));

      logger.info({
        matchId,
        msg: 'Match and PlayerMatchItems completed successfully',
      });

      return await getMatch(matchId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        throw error;
      }
      logger.error({
        error,
        matchId,
        params,
        msg: 'Error completing match with outcome',
      });
      throw error;
    }
  };

  return {
    getMatch,
    persistNewMatch,
    persistMatchAsset,
    removeMatchAsset,
    persistPlayerReadyStatus,
    transitionMatchToInProgress,
    transitionMatchToAssetSelection,
    setAssetInitialPricing,
    completeMatchWithOutcome,
    updateMatchTentativeEndTime,
    countInProgressMatchesForUser,
    addChatMessage,
  };
};
