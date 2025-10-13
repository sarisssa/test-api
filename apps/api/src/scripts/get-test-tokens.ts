import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { config } from 'dotenv';
import jwt from 'jsonwebtoken';
import { DynamoDBUserItem } from '../models/user.js';

config();

const JWT_SECRET = process.env.JWT_SECRET;
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'wage-main-dev';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const client = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);

async function getTestUsers() {
  const result = await dynamodb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression:
        'EntityType = :entityType AND begins_with(phoneNumber, :prefix)',
      ExpressionAttributeValues: {
        ':entityType': 'User',
        ':prefix': '+15551234', // Test user phone prefix
      },
    })
  );

  return (result.Items || []) as DynamoDBUserItem[];
}

async function generateTestTokens() {
  console.log('🔍 Fetching test users from DynamoDB...\n');

  const users = await getTestUsers();

  if (users.length === 0) {
    console.log('⚠️  No test users found. Run seed-users.ts first.');
    return;
  }

  console.log(`Found ${users.length} test users:\n`);

  users.forEach(user => {
    const accessToken = jwt.sign(
      {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        type: 'access_token',
      },
      JWT_SECRET!,
      { expiresIn: '10d' }
    );

    console.log(`👤 ${user.username || 'Unknown'} (${user.phoneNumber})`);
    console.log(`   User ID: ${user.userId}`);
    console.log(`   Access Token:`);
    console.log(`   ${accessToken}\n`);
  });
}

generateTestTokens()
  .then(() => {
    console.log('✨ Token generation complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Error:', error);
    process.exit(1);
  });
