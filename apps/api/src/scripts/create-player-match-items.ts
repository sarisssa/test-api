import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const GOLDEN_WHALE_USER_PK =
  'USER#ab409179e13c1086e79e0a58a8ebad9ce48b8981e5b13131e2cd292b26b89218';

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: process.env.DYNAMODB_URL || undefined,
  credentials: process.env.DYNAMODB_URL
    ? {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      }
    : undefined,
});

const docClient = DynamoDBDocumentClient.from(client);

async function createPlayerMatchItems() {
  const tableName = process.env.DYNAMODB_TABLE_NAME || 'wage-main-dev';
  const now = new Date();

  const matchConfigs = [
    {
      result: 'win' as const,
      wagerAmount: 10,
      duration: 60,
      category: 'stock' as const,
      createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      startedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      tentativeEndTime: new Date(
        now.getTime() - 10 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000
      ),
      endedAt: new Date(
        now.getTime() - 10 * 24 * 60 * 60 * 1000 + 55 * 60 * 1000
      ),
      performancePercentage: 12.5,
      opponentPerformancePercentage: 8.3,
    },
    {
      result: 'loss' as const,
      wagerAmount: 15,
      duration: 120,
      category: 'crypto' as const,
      createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      startedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      tentativeEndTime: new Date(
        now.getTime() - 7 * 24 * 60 * 60 * 1000 + 120 * 60 * 1000
      ),
      endedAt: new Date(
        now.getTime() - 7 * 24 * 60 * 60 * 1000 + 118 * 60 * 1000
      ),
      performancePercentage: -3.2,
      opponentPerformancePercentage: 5.7,
    },
    {
      result: 'win' as const,
      wagerAmount: 25,
      duration: 240,
      category: 'stock' as const,
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      startedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      tentativeEndTime: new Date(
        now.getTime() - 3 * 24 * 60 * 60 * 1000 + 240 * 60 * 1000
      ),
      endedAt: new Date(
        now.getTime() - 3 * 24 * 60 * 60 * 1000 + 235 * 60 * 1000
      ),
      performancePercentage: 15.8,
      opponentPerformancePercentage: 9.1,
    },
    {
      result: 'win' as const,
      wagerAmount: 5,
      duration: 30,
      category: 'commodities' as const,
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      startedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      tentativeEndTime: new Date(
        now.getTime() - 1 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000
      ),
      endedAt: new Date(
        now.getTime() - 1 * 24 * 60 * 60 * 1000 + 28 * 60 * 1000
      ),
      performancePercentage: 7.2,
      opponentPerformancePercentage: 2.4,
    },
    {
      result: 'pending' as const,
      wagerAmount: 10,
      duration: 60,
      category: 'stock' as const,
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      startedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      tentativeEndTime: new Date(
        now.getTime() - 2 * 60 * 60 * 1000 + 60 * 60 * 1000
      ),
      performancePercentage: 3.5,
      opponentPerformancePercentage: 4.2,
    },
  ];

  console.log('Creating 5 PlayerMatchItems for GoldenWhale...\n');

  for (let i = 0; i < matchConfigs.length; i++) {
    const config = matchConfigs[i];
    const matchId = uuidv4();
    const opponentId = 'a3819c45-ed29-45d7-a097-77df2f6fd118';

    const playerMatchItem = {
      pk: GOLDEN_WHALE_USER_PK,
      sk: `MATCH#${matchId}`,
      EntityType: 'PlayerMatch',
      id: matchId,
      opponentId: opponentId,
      opponentUsername: `Wage${i + 1}`,
      result: config.result,
      wagerAmount: config.wagerAmount,
      duration: config.duration,
      category: config.category,
      createdAt: config.createdAt.toISOString(),
      tentativeEndTime: config.tentativeEndTime.toISOString(),
      ...(config.startedAt && {
        startedAt: config.startedAt.toISOString(),
      }),
      ...(config.endedAt && {
        endedAt: config.endedAt.toISOString(),
      }),
      ...(config.performancePercentage !== undefined && {
        performancePercentage: config.performancePercentage,
      }),
      ...(config.opponentPerformancePercentage !== undefined && {
        opponentPerformancePercentage: config.opponentPerformancePercentage,
      }),
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: playerMatchItem,
        })
      );

      console.log(`✅ Created PlayerMatchItem ${i + 1}/${matchConfigs.length}`);
      console.log(`   Match ID: ${matchId}`);
      console.log(`   Opponent: ${opponentId.substring(0, 8)}...`);
      console.log(`   Result: ${config.result}`);
      console.log(`   Category: ${config.category}`);
      if (config.performancePercentage !== undefined) {
        console.log(`   Performance: ${config.performancePercentage}%`);
      }
      console.log('');
    } catch (error) {
      console.error(`❌ Failed to create PlayerMatchItem ${i + 1}:`, error);
      throw error;
    }
  }

  console.log('✅ Successfully created all 5 PlayerMatchItems!');
}

createPlayerMatchItems()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
