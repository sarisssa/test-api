import { FastifyInstance } from 'fastify';
import {
  validateAssetSelection,
  validateMatchAccess,
} from '../validators/match-validator.js';
import { addAssetToMatch, getMatch } from './match.js';

export const handleAssetSelection = async (
  fastify: FastifyInstance,
  userId: string,
  payload: { matchId: string; ticker: string }
) => {
  const { matchId, ticker } = payload;

  try {
    const matchData = await getMatch(fastify, matchId);
    const { match, opponentId } = validateMatchAccess(matchData, userId);

    const playerAssets = match.playerAssets[userId]?.assets || [];
    const opponentAssets = match.playerAssets[opponentId]?.assets || [];

    validateAssetSelection(playerAssets, opponentAssets, ticker);

    await addAssetToMatch(fastify, matchId, userId, { ticker });

    const updatedMatch = await getMatch(fastify, matchId);

    console.log('updatedMatch', updatedMatch);

    // Broadcast update to both players
    // broadcastToMatch(fastify, updatedMatch.matchId, {
    //   type: 'asset_selection_update',
    //   matchId: updatedMatch.matchId,
    //   playerAssets: updatedMatch.playerAssets,
    // });
  } catch (error: any) {
    // Explicitly type error as 'any' or 'unknown' and narrow
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('Failed to update asset selection: ' + error.message); // Re-throw with more context
    }
    throw error;
  }
};

// export async function handleReadyCheck(
//   fastify: FastifyInstance,
//   userId: string,
//   payload: { matchId: string }
// ) {
//   const match = await getMatch(fastify, payload.matchId);
//   if (!match.players.includes(userId)) {
//     throw new Error('Not authorized for this match');
//   }

//   // Update ready status
//   await fastify.dynamodb.send(
//     new UpdateCommand({
//       TableName: 'WageTable',
//       Key: { PK: `MATCH#${payload.matchId}`, SK: 'DETAILS' },
//       UpdateExpression: 'SET playerAssets.#userId.readyAt = :now',
//       ExpressionAttributeNames: { '#userId': userId },
//       ExpressionAttributeValues: { ':now': new Date().toISOString() },
//     })
//   );

//   // Check if both players ready
//   const updatedMatch = await getMatch(fastify, payload.matchId);
//   const allReady = Object.values(updatedMatch.playerAssets).every(
//     player => player.readyAt
//   );

//   if (allReady) {
//     // Start match
//     await startMatch(fastify, payload.matchId);
//   }

//   await broadcastToMatch(fastify, match.matchId, {
//     type: 'ready_status_update',
//     matchId: match.matchId,
//     playerAssets: updatedMatch.playerAssets,
//     status: allReady ? 'in_progress' : 'ready_check',
//   });
// }
