//Only for local development, TF will set up the table

import {
  BillingMode,
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  KeyType,
  ProjectionType,
  ScalarAttributeType,
} from '@aws-sdk/client-dynamodb';

const TABLE_NAME = 'WageTable';

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566', // LocalStack
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

async function createTable() {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`✅ Table '${TABLE_NAME}' already exists`);
    return;
  } catch (error) {
    if (error instanceof Error && error.name !== 'ResourceNotFoundException') {
      throw error;
    }
  }

  const params = {
    TableName: TABLE_NAME,
    KeySchema: [
      { AttributeName: 'PK', KeyType: KeyType.HASH },
      { AttributeName: 'SK', KeyType: KeyType.RANGE },
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'SK', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'phoneNumber', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'username', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'status', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'createdAt', AttributeType: ScalarAttributeType.S },
    ],
    BillingMode: BillingMode.PAY_PER_REQUEST,
    GlobalSecondaryIndexes: [
      {
        IndexName: 'PhoneNumber-GSI',
        KeySchema: [{ AttributeName: 'phoneNumber', KeyType: KeyType.HASH }],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
      {
        IndexName: 'Username-GSI',
        KeySchema: [{ AttributeName: 'username', KeyType: KeyType.HASH }],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
      {
        IndexName: 'MatchStatus-GSI',
        KeySchema: [
          { AttributeName: 'status', KeyType: KeyType.HASH },
          { AttributeName: 'createdAt', KeyType: KeyType.RANGE },
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
    ],
  };

  try {
    console.log(`🔨 Creating table: ${TABLE_NAME}`);
    await client.send(new CreateTableCommand(params));
    console.log(`✅ Table '${TABLE_NAME}' created successfully`);
  } catch (err) {
    console.error('❌ Error creating table:', err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createTable();
}

export { createTable };
