import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { AssetType } from '../types/match.js';

const matchId = uuidv4();
const now = new Date();
const matchStartTime = new Date(now.getTime() - 35 * 60 * 1000); // Started 35 mins ago
const matchEndTime = new Date(now.getTime() - 5 * 60 * 1000); // Ended 5 mins ago
const assetSelectionStart = new Date(now.getTime() - 37 * 60 * 1000);

// GoldenWhale (Player A)
const PLAYER_A = '2458ffc6-6cac-43f9-b3cd-1b124064bc24';
// SilverFox (Player B)
const PLAYER_B = 'a3819c45-ed29-45d7-a097-77df2f6fd118';

// AWS SDK will automatically use AWS_PROFILE from environment
const client = new DynamoDBClient({
  region: 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

async function createCompletedMatch() {
  // Player A assets with made-up prices
  const playerAAssets = [
    {
      ticker: 'MS',
      name: 'Morgan Stanley',
      assetType: AssetType.STOCK,
      selectedAt: assetSelectionStart.toISOString(),
      initialPrice: 105.5,
      shares: 31.64,
      currentPrice: 108.2, // +2.56%
      endPrice: 108.2,
      lastUpdatedAt: matchEndTime.toISOString(),
    },
    {
      ticker: 'TSLA',
      name: 'Tesla Inc',
      assetType: AssetType.STOCK,
      selectedAt: assetSelectionStart.toISOString(),
      initialPrice: 242.8,
      shares: 13.75,
      currentPrice: 238.5, // -1.77%
      endPrice: 238.5,
      lastUpdatedAt: matchEndTime.toISOString(),
    },
    {
      ticker: 'NVDA',
      name: 'NVIDIA Corporation',
      assetType: AssetType.STOCK,
      selectedAt: assetSelectionStart.toISOString(),
      initialPrice: 136.7,
      shares: 24.41,
      currentPrice: 141.3, // +3.36%
      endPrice: 141.3,
      lastUpdatedAt: matchEndTime.toISOString(),
    },
  ];

  // Player B assets with made-up prices
  const playerBAssets = [
    {
      ticker: 'AAPL',
      name: 'Apple Inc',
      assetType: AssetType.STOCK,
      selectedAt: assetSelectionStart.toISOString(),
      initialPrice: 229.5,
      shares: 14.55,
      currentPrice: 231.8, // +1.00%
      endPrice: 231.8,
      lastUpdatedAt: matchEndTime.toISOString(),
    },
    {
      ticker: 'TSLA',
      name: 'Tesla Inc',
      assetType: AssetType.STOCK,
      selectedAt: assetSelectionStart.toISOString(),
      initialPrice: 242.8,
      shares: 13.75,
      currentPrice: 238.5, // -1.77%
      endPrice: 238.5,
      lastUpdatedAt: matchEndTime.toISOString(),
    },
    {
      ticker: 'MSFT',
      name: 'Microsoft Corporation',
      assetType: AssetType.STOCK,
      selectedAt: assetSelectionStart.toISOString(),
      initialPrice: 416.2,
      shares: 8.02,
      currentPrice: 420.5, // +1.03%
      endPrice: 420.5,
      lastUpdatedAt: matchEndTime.toISOString(),
    },
  ];

  // Calculate final scores
  const playerAScore =
    playerAAssets[0].currentPrice * playerAAssets[0].shares +
    playerAAssets[1].currentPrice * playerAAssets[1].shares +
    playerAAssets[2].currentPrice * playerAAssets[2].shares;

  const playerBScore =
    playerBAssets[0].currentPrice * playerBAssets[0].shares +
    playerBAssets[1].currentPrice * playerBAssets[1].shares +
    playerBAssets[2].currentPrice * playerBAssets[2].shares;

  const winner = playerAScore > playerBScore ? PLAYER_A : PLAYER_B;
  const loser = playerAScore > playerBScore ? PLAYER_B : PLAYER_A;

  const match = {
    pk: `MATCH#${matchId}`,
    sk: 'DETAILS',
    EntityType: 'Match',
    matchId,
    players: [PLAYER_A, PLAYER_B],
    status: 'completed',
    completionReason: 'time_expired',
    createdAt: assetSelectionStart.toISOString(),
    assetSelectionStartedAt: assetSelectionStart.toISOString(),
    assetSelectionEndedAt: matchStartTime.toISOString(),
    matchStartedAt: matchStartTime.toISOString(),
    matchTentativeEndTime: matchEndTime.toISOString(),
    matchEndedAt: matchEndTime.toISOString(),
    winner,
    loser,
    finalScores: {
      [PLAYER_A]: playerAScore,
      [PLAYER_B]: playerBScore,
    },
    playerAssets: {
      [PLAYER_A]: {
        readyAt: matchStartTime.toISOString(),
        assets: playerAAssets,
      },
      [PLAYER_B]: {
        readyAt: matchStartTime.toISOString(),
        assets: playerBAssets,
      },
    },
    lastPriceUpdateAt: matchEndTime.toISOString(),
    priceUpdateCount: 30,
  };

  const tableName = process.env.DYNAMODB_TABLE_NAME || 'wage-main-dev';

  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: match,
      })
    );
    console.log('✅ Completed test match created successfully\n');
    console.log('Match ID:', matchId);
    console.log('Status:', match.status);
    console.log('Completion Reason:', match.completionReason);
    console.log('\n📊 Results:');
    console.log(
      `Player A - GoldenWhale (${PLAYER_A.substring(0, 8)}...): $${playerAScore.toFixed(2)}`
    );
    console.log('  Assets: MS, TSLA, NVDA');
    console.log(
      `Player B - SilverFox (${PLAYER_B.substring(0, 8)}...): $${playerBScore.toFixed(2)}`
    );
    console.log('  Assets: AAPL, TSLA, MSFT');
    console.log(
      `\n🏆 Winner: ${winner === PLAYER_A ? 'GoldenWhale' : 'SilverFox'}`
    );
    console.log(
      `   Margin: $${Math.abs(playerAScore - playerBScore).toFixed(2)}`
    );
    console.log('\n⏱️  Timeline:');
    console.log('  Match Started:', matchStartTime.toISOString());
    console.log('  Match Ended:', matchEndTime.toISOString());
  } catch (error) {
    console.error('❌ Error creating completed test match:', error);
    process.exit(1);
  }
}

createCompletedMatch();
