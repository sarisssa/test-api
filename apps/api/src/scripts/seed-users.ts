import type { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { config } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBUserItem } from '../models/user.js';
import {
  hashPhoneNumber,
  initializePhoneHashSalt,
} from '../utils/phone-utils.js';

process.on('uncaughtException', err => {
  console.error('💥 Uncaught exception in seed-users script:', err);
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  console.error('💥 Unhandled promise rejection in seed-users script:', reason);
  process.exit(1);
});

config();

const PHONE_HASH_SALT = process.env.PHONE_HASH_SALT;
if (!PHONE_HASH_SALT) {
  throw new Error('PHONE_HASH_SALT environment variable is required');
}
initializePhoneHashSalt(PHONE_HASH_SALT);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'WageTable';

const region = process.env.AWS_REGION ?? 'us-east-1';
const endpoint =
  process.env.DYNAMODB_URL ??
  process.env.DYNAMODB_ENDPOINT ??
  process.env.LOCALSTACK_ENDPOINT;

const clientConfig: DynamoDBClientConfig = {
  region,
};

if (endpoint) {
  clientConfig.endpoint = endpoint;
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  };
}

const client = new DynamoDBClient(clientConfig);

const dynamodb = DynamoDBDocumentClient.from(client);

interface TestUserData {
  phoneNumber: string;
  username: string;
  experiencePoints: number;
  stats: {
    totalMatches: number;
    wins: number;
    losses: number;
    inGameCurrency: number;
  };
  bio?: string;
}

type SeedUserItem = DynamoDBUserItem;

const testUsers: TestUserData[] = [
  {
    // Rookie tier user
    phoneNumber: '+15551234001',
    username: 'RookieTrader',
    experiencePoints: 500,
    stats: {
      totalMatches: 5,
      wins: 2,
      losses: 3,
      inGameCurrency: 200,
    },
    bio: '🌱 Just starting my trading journey!',
  },
  {
    // Bronze tier user
    phoneNumber: '+15551234002',
    username: 'BronzeBull',
    experiencePoints: 1500,
    stats: {
      totalMatches: 15,
      wins: 8,
      losses: 7,
      inGameCurrency: 500,
    },
    bio: '📈 Climbing the ranks one trade at a time',
  },
  {
    // Silver tier user
    phoneNumber: '+15551234003',
    username: 'SilverFox',
    experiencePoints: 3000,
    stats: {
      totalMatches: 30,
      wins: 18,
      losses: 12,
      inGameCurrency: 1000,
    },
    bio: '🦊 Cunning trader, always watching the market',
  },
  {
    // Gold tier user
    phoneNumber: '+15551234004',
    username: 'GoldenWhale',
    experiencePoints: 8000,
    stats: {
      totalMatches: 50,
      wins: 35,
      losses: 15,
      inGameCurrency: 2000,
    },
    bio: '🐋 Making waves in the market',
  },
  {
    // Elite tier user
    phoneNumber: '+15551234005',
    username: 'EliteTrader',
    experiencePoints: 20000,
    stats: {
      totalMatches: 100,
      wins: 75,
      losses: 25,
      inGameCurrency: 5000,
    },
    bio: '👑 Market maestro at your service',
  },
];

function transformUserToDynamoDB(userData: TestUserData): SeedUserItem {
  const now = new Date().toISOString();
  const hashedPhoneNumber = hashPhoneNumber(userData.phoneNumber);

  const baseItem: DynamoDBUserItem = {
    pk: `USER#${hashedPhoneNumber}`,
    sk: 'PROFILE',
    EntityType: 'User',
    userId: uuidv4(),
    hashedPhoneNumber,
    phoneNumber: userData.phoneNumber,
    username: userData.username,
    createdAt: now,
    lastLoggedIn: now,
    stats: {
      totalMatches: userData.stats.totalMatches,
      wins: userData.stats.wins,
      losses: userData.stats.losses,
      experience: userData.experiencePoints,
      inGameCurrency: userData.stats.inGameCurrency,
      capital: 0,
    },
    bio: userData.bio,
  };

  return baseItem;
}

async function batchWrite(items: SeedUserItem[]) {
  const BATCH_SIZE = 25;
  const batches = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE));
  }

  console.log(`Writing ${items.length} users in ${batches.length} batches...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `Processing batch ${i + 1}/${batches.length} (${batch.length} users)...`
    );

    const writeRequests = batch.map(item => ({
      PutRequest: {
        Item: item,
      },
    }));

    try {
      await dynamodb.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: writeRequests,
          },
        })
      );
      console.log(`✅ Batch ${i + 1} completed`);
    } catch (error) {
      console.error(`❌ Error writing batch ${i + 1}:`, error);
      throw error;
    }
  }
}

async function seedUsers() {
  console.log('👥 Starting user seeding...');

  try {
    const userItems = testUsers.map(transformUserToDynamoDB);

    await batchWrite(userItems);

    console.log('\n🎉 Successfully seeded test users:');
    userItems.forEach(user => {
      console.log(`- ${user.username} (${user.userId})`);
      console.log(`  Phone: ${user.phoneNumber}`);
      console.log(`  XP: ${user.stats.experience}`);
      console.log(`  Stats: ${user.stats.wins}W/${user.stats.losses}L`);
      console.log('  ----------------');
    });
  } catch (error) {
    console.error('💥 Fatal error during user seeding:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedUsers()
    .then(() => {
      console.log('✨ User seeding completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

export { seedUsers };
