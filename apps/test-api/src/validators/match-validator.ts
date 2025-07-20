import { DynamoDBMatchItem } from '../models/match.js';

const MAX_ASSETS_PER_PLAYER = 3;

type Asset = DynamoDBMatchItem['playerAssets'][string]['assets'][number];

export const validateMatchAccess = (
  match: DynamoDBMatchItem | undefined,
  userId: string
): { match: DynamoDBMatchItem; opponentId: string } => {
  if (!match) {
    throw new Error('Match not found');
  }

  if (!match.players.includes(userId)) {
    throw new Error('Not authorized for this match');
  }

  const opponentId = match.players.find(id => id !== userId);
  if (!opponentId) {
    throw new Error('Opponent not found in match players.');
  }

  return { match, opponentId };
};

export const validateAssetSelection = (
  playerAssets: Asset[],
  opponentAssets: Asset[],
  ticker: string
): void => {
  if (playerAssets.some((asset: Asset) => asset.ticker === ticker)) {
    throw new Error('Asset already selected by you.');
  }

  if (playerAssets.length >= MAX_ASSETS_PER_PLAYER) {
    throw new Error('You have already selected 3 assets.');
  }

  // Check for 3 overlapping assets with opponent
  if (playerAssets.length === 2 && opponentAssets.length === 3) {
    const opponentTickers = new Set(opponentAssets.map((a: Asset) => a.ticker));
    const proposedSet = [...playerAssets.map((a: Asset) => a.ticker), ticker];

    if (
      proposedSet.every((t: string) => opponentTickers.has(t)) &&
      proposedSet.length === opponentTickers.size
    ) {
      throw new Error('Cannot select an identical set of assets as opponent.');
    }
  }
};
