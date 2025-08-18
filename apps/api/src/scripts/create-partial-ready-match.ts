import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { AssetType } from '../types/match.js';

const matchId = uuidv4();
const now = new Date();
const twoMinutesFromNow = new Date(now.getTime() + 2 * 60 * 1000);

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566', // LocalStack
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

const docClient = DynamoDBDocumentClient.from(client);

async function createTestMatch() {
  const match = {
    PK: `MATCH#${matchId}`,
    SK: 'DETAILS',
    EntityType: 'Match',
    matchId,
    players: ['420', '421'],
    status: 'asset_selection',
    createdAt: now.toISOString(),
    assetSelectionStartedAt: now.toISOString(),
    assetSelectionEndedAt: twoMinutesFromNow.toISOString(),
    playerAssets: {
      '420': {
        readyAt: now.toISOString(),
        assets: [
          {
            selectedAt: now.toISOString(),
            ticker: 'MS',
            assetType: AssetType.STOCK,
          },
          {
            selectedAt: now.toISOString(),
            ticker: 'AAPL',
            assetType: AssetType.STOCK,
          },
          {
            selectedAt: now.toISOString(),
            ticker: 'TSLA',
            assetType: AssetType.STOCK,
          },
        ],
      },
      '421': {
        assets: [
          {
            selectedAt: now.toISOString(),
            ticker: 'MS',
            assetType: AssetType.STOCK,
          },
          {
            selectedAt: now.toISOString(),
            ticker: 'AAPL',
            assetType: AssetType.STOCK,
          },
          {
            selectedAt: now.toISOString(),
            ticker: 'MSFT',
            assetType: AssetType.STOCK,
          },
        ],
      },
    },
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: 'WageTable',
        Item: match,
      })
    );
    console.log('✅ Test match created successfully');
    console.log('Match ID:', matchId);
    console.log('Players:', match.players);
    console.log('Status:', match.status);
  } catch (error) {
    console.error('❌ Error creating test match:', error);
  }
}

createTestMatch();
