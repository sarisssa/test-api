import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

/**
 * ComputeOutcome Lambda Handler
 *
 * Invoked by Step Functions to compute match outcome after time expires.
 *
 * Input (from Step Functions):
 *   { matchId, tableName, matchPk, matchSk }
 *
 * Output (to Step Functions at $.compute.Payload):
 *   { winnerId, loserId, finalScores, returns, matchEndedAtIso }
 *
 * Logic:
 *   1. Fetch match from DynamoDB
 *   2. Fetch current asset prices for all tickers
 *   3. Compute portfolio totals for each player
 *   4. Calculate percentage returns vs. initial 100,000
 *   5. Determine winner by highest return (tie → lexicographic player ID)
 */

interface ComputeOutcomeInput {
  matchId: string;
  tableName: string;
  matchPk: string;
  matchSk: string;
}

interface ComputeOutcomeOutput {
  winnerId: string;
  loserId: string;
  finalScores: Record<string, number>;
  returns: Record<string, number>;
  matchEndedAtIso: string;
}

interface PlayerAsset {
  ticker: string;
  assetType: 'STOCK' | 'CRYPTO' | 'COMMODITY';
  initialPrice: number;
  shares: number;
  endPrice?: number;
  currentPrice?: number;
}

interface PlayerAssetSelection {
  assets: PlayerAsset[];
  readyAt?: string;
}

interface MatchItem {
  matchId: string;
  players: string[];
  playerAssets: Record<string, PlayerAssetSelection>;
  status: string;
  completionReason?: 'time_expired' | 'forfeited' | 'manual';
  winner?: string;
  loser?: string;
}

const INITIAL_PORTFOLIO_VALUE = 100_000;

// Initialize DynamoDB client
const dynamodb = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  ...(process.env.DYNAMODB_URL && { endpoint: process.env.DYNAMODB_URL }),
});

/**
 * Fetch match from DynamoDB
 */
async function fetchMatch(
  tableName: string,
  pk: string,
  sk: string
): Promise<MatchItem> {
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: {
        pk: { S: pk },
        sk: { S: sk },
      },
      ConsistentRead: true,
    })
  );

  if (!result.Item) {
    throw new Error(`Match not found: pk=${pk}, sk=${sk}`);
  }

  return unmarshall(result.Item) as MatchItem;
}

/**
 * Fetch current asset price from DynamoDB
 * Queries directly by ticker using ASSET#{ticker} pattern
 */
async function fetchAssetPrice(
  tableName: string,
  ticker: string
): Promise<number | null> {
  try {
    const result = await dynamodb.send(
      new GetItemCommand({
        TableName: tableName,
        Key: {
          pk: { S: `ASSET#${ticker}` },
          sk: { S: 'METADATA' },
        },
        ConsistentRead: true,
      })
    );

    if (result.Item) {
      const asset = unmarshall(result.Item);
      if (typeof asset.currentPrice === 'number') {
        return asset.currentPrice;
      }
    }
  } catch (error) {
    console.warn(`Failed to fetch price for ${ticker}:`, error);
  }

  return null;
}

/**
 * Compute portfolio totals for all players
 */
async function computeFinalScores(
  tableName: string,
  match: MatchItem
): Promise<Record<string, number>> {
  // 1. Collect all unique tickers
  const tickers = new Set<string>();
  Object.values(match.playerAssets ?? {}).forEach(selection => {
    selection.assets.forEach(asset => tickers.add(asset.ticker));
  });

  // 2. Fetch current prices for all tickers
  const priceMap: Record<string, number> = {};
  await Promise.all(
    Array.from(tickers).map(async ticker => {
      const price = await fetchAssetPrice(tableName, ticker);
      if (price !== null) {
        priceMap[ticker] = price;
      }
    })
  );

  // 3. Calculate total portfolio value for each player
  const totals: Record<string, number> = {};
  for (const playerId of match.players) {
    const selection = match.playerAssets[playerId];
    const total = (selection?.assets ?? []).reduce((sum, asset) => {
      const shares = asset.shares ?? 0;
      // Price priority: per-match currentPrice > endPrice > global price > initialPrice
      const price =
        asset.currentPrice ??
        asset.endPrice ??
        priceMap[asset.ticker] ??
        asset.initialPrice ??
        0;
      return sum + shares * price;
    }, 0);
    totals[playerId] = total;
  }

  return totals;
}

/**
 * Calculate percentage returns vs. initial portfolio value
 */
function computeReturns(
  finalScores: Record<string, number>
): Record<string, number> {
  const returns: Record<string, number> = {};
  for (const [playerId, finalValue] of Object.entries(finalScores)) {
    returns[playerId] =
      ((finalValue - INITIAL_PORTFOLIO_VALUE) / INITIAL_PORTFOLIO_VALUE) * 100;
  }
  return returns;
}

/**
 * Determine winner by highest return percentage
 * Tie-breaker: lexicographic player ID comparison (deterministic)
 */
function determineWinner(
  returns: Record<string, number>,
  players: string[]
): { winnerId: string; loserId: string } {
  if (players.length !== 2) {
    throw new Error(`Expected exactly 2 players, got ${players.length}`);
  }

  const [playerA, playerB] = players;
  const returnA = returns[playerA] ?? 0;
  const returnB = returns[playerB] ?? 0;

  let winnerId: string;
  let loserId: string;

  if (returnA === returnB) {
    // Tie: deterministic tie-breaker using player ID string comparison
    winnerId = playerA < playerB ? playerA : playerB;
    loserId = playerA < playerB ? playerB : playerA;
  } else {
    winnerId = returnA > returnB ? playerA : playerB;
    loserId = returnA > returnB ? playerB : playerA;
  }

  return { winnerId, loserId };
}

/**
 * Lambda handler
 */
export const handler = async (
  event: ComputeOutcomeInput
): Promise<ComputeOutcomeOutput> => {
  console.log('ComputeOutcome Lambda invoked:', JSON.stringify(event, null, 2));

  const { matchId, tableName, matchPk, matchSk } = event;

  try {
    // 1. Fetch match
    const match = await fetchMatch(tableName, matchPk, matchSk);
    console.log(
      `Fetched match ${matchId} with ${match.players.length} players`
    );

    // Check if match was already completed via forfeit/manual with winner set
    if (
      match.completionReason &&
      match.completionReason !== 'time_expired' &&
      match.winner &&
      match.loser
    ) {
      console.log(
        `Match already completed via ${match.completionReason} with winner=${match.winner}`
      );

      // Still compute scores for reporting, but don't override winner
      const finalScores = await computeFinalScores(tableName, match);
      const returns = computeReturns(finalScores);
      const matchEndedAtIso = new Date().toISOString();

      return {
        winnerId: match.winner, // Use existing winner
        loserId: match.loser, // Use existing loser
        finalScores,
        returns,
        matchEndedAtIso,
      };
    }

    // 2. Compute final portfolio values
    const finalScores = await computeFinalScores(tableName, match);
    console.log('Final scores:', finalScores);

    // 3. Calculate percentage returns
    const returns = computeReturns(finalScores);
    console.log('Returns:', returns);

    // 4. Determine winner by scores (for time_expired matches)
    const { winnerId, loserId } = determineWinner(returns, match.players);
    console.log(`Winner: ${winnerId}, Loser: ${loserId}`);

    // 5. Generate timestamp
    const matchEndedAtIso = new Date().toISOString();

    return {
      winnerId,
      loserId,
      finalScores,
      returns,
      matchEndedAtIso,
    };
  } catch (error) {
    console.error('ComputeOutcome Lambda error:', error);
    throw error;
  }
};
