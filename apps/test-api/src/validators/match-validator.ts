import { MAX_ASSETS_PER_PLAYER } from '../constants.js';
import {
  DuplicateAssetError,
  IdenticalAssetSetError,
  MatchNotFoundError,
  MatchValidationError,
  MaxAssetsReachedError,
  NotEnoughAssetsError,
  UnauthorizedMatchAccessError,
} from '../errors/index.js';
import { DynamoDBMatchItem } from '../models/match.js';

export const validatePlayers = (players: string[]): void => {
  // Check for unique players
  const uniquePlayers = new Set(players);
  if (uniquePlayers.size !== players.length) {
    throw new MatchValidationError(
      'Players array contains duplicate player IDs'
    );
  }

  // Check for exactly 2 players
  if (players.length !== 2) {
    throw new MatchValidationError('Match must have exactly 2 players');
  }
};

export const validateMatchAccess = (
  match: DynamoDBMatchItem | undefined,
  userId: string
): { match: DynamoDBMatchItem; opponentId: string } => {
  if (!match) {
    throw new MatchNotFoundError();
  }

  if (!match.players.includes(userId)) {
    throw new UnauthorizedMatchAccessError();
  }

  const opponentId = match.players.find(id => id !== userId);
  if (!opponentId) {
    throw new MatchValidationError('Opponent not found in match players');
  }

  return { match, opponentId };
};

export const validateAssetSelection = (
  match: DynamoDBMatchItem,
  userId: string,
  ticker: string
): void => {
  // Validate player is in match
  if (!match.players.includes(userId)) {
    throw new UnauthorizedMatchAccessError();
  }

  const playerAssets = match.playerAssets[userId]?.assets || [];
  const opponentId = match.players.find(id => id !== userId);
  if (!opponentId) {
    throw new MatchValidationError('Opponent not found in match players');
  }
  const opponentAssets = match.playerAssets[opponentId]?.assets || [];

  // Check for duplicate ticker
  if (playerAssets.some(asset => asset.ticker === ticker)) {
    throw new DuplicateAssetError();
  }

  // Check max assets
  if (playerAssets.length >= MAX_ASSETS_PER_PLAYER) {
    throw new MaxAssetsReachedError();
  }

  // Check for identical set with opponent
  if (playerAssets.length === 2 && opponentAssets.length === 3) {
    const opponentTickers = new Set(opponentAssets.map(a => a.ticker));
    const proposedSet = [...playerAssets.map(a => a.ticker), ticker];

    if (
      proposedSet.every(t => opponentTickers.has(t)) &&
      proposedSet.length === opponentTickers.size
    ) {
      throw new IdenticalAssetSetError();
    }
  }
};

export const canPlayerReadyUp = (
  match: DynamoDBMatchItem,
  userId: string
): void => {
  const playerAssets = match.playerAssets?.[userId]?.assets;
  if (!playerAssets || playerAssets.length < MAX_ASSETS_PER_PLAYER) {
    throw new NotEnoughAssetsError(
      `Please select ${MAX_ASSETS_PER_PLAYER} assets before marking yourself ready.`
    );
  }
};
