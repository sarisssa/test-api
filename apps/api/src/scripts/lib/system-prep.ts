import {
  BillingMode,
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  KeyType,
  ProjectionType,
  ScalarAttributeType,
} from '@aws-sdk/client-dynamodb';
import {
  CreateStateMachineCommand,
  DescribeStateMachineCommand,
  SFNClient,
  UpdateStateMachineCommand,
} from '@aws-sdk/client-sfn';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Redis as RedisClient } from 'ioredis';

import { buildMatchSettlementDefinition } from '../../step-functions/definition.js';
import { createRedisClient } from '../../utils/redis.js';
import {
  COMMODITY_ASSETS,
  CRYPTO_ASSETS,
  STOCK_TICKERS,
  type AssetSeed,
} from './asset-lists.js';

export const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
export const DYNAMODB_TABLE =
  process.env.WAGE_TABLE_NAME ?? process.env.DYNAMODB_TABLE_NAME ?? 'WageTable';
export const DYNAMODB_ENDPOINT =
  process.env.DYNAMODB_URL ?? 'http://localhost:4566';
export const STEP_FUNCTIONS_ARN =
  process.env.MATCH_SETTLEMENT_STATE_MACHINE_ARN ?? '';
export const STEP_FUNCTIONS_ENDPOINT = process.env.STEP_FUNCTIONS_ENDPOINT;
export const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
export const REDIS_TLS_REJECT =
  process.env.REDIS_TLS_REJECT_UNAUTHORIZED ?? 'false';

export const dynamoClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: DYNAMODB_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
});

export const documentClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const shouldInitialiseStepFunctionsClient =
  Boolean(STEP_FUNCTIONS_ARN) || Boolean(STEP_FUNCTIONS_ENDPOINT);

export const stepFunctionsClient = shouldInitialiseStepFunctionsClient
  ? new SFNClient({
      region: AWS_REGION,
      ...(STEP_FUNCTIONS_ENDPOINT ? { endpoint: STEP_FUNCTIONS_ENDPOINT } : {}),
    })
  : null;

export async function ensureDynamoTable(): Promise<void> {
  try {
    await dynamoClient.send(
      new DescribeTableCommand({
        TableName: DYNAMODB_TABLE,
      })
    );
    console.log(`✅ DynamoDB table '${DYNAMODB_TABLE}' already exists`);
    return;
  } catch (error) {
    if (error instanceof Error && error.name !== 'ResourceNotFoundException') {
      throw error;
    }
    console.log(
      `ℹ️  DynamoDB table '${DYNAMODB_TABLE}' not found. Creating...`
    );
  }

  await dynamoClient.send(
    new CreateTableCommand({
      TableName: DYNAMODB_TABLE,
      KeySchema: [
        { AttributeName: 'pk', KeyType: KeyType.HASH },
        { AttributeName: 'sk', KeyType: KeyType.RANGE },
      ],
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
        {
          AttributeName: 'hashedPhoneNumber',
          AttributeType: ScalarAttributeType.S,
        },
        { AttributeName: 'username', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'status', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'createdAt', AttributeType: ScalarAttributeType.S },
      ],
      BillingMode: BillingMode.PAY_PER_REQUEST,
      GlobalSecondaryIndexes: [
        {
          IndexName: 'PhoneNumber-GSI',
          KeySchema: [
            { AttributeName: 'hashedPhoneNumber', KeyType: KeyType.HASH },
          ],
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
    })
  );

  console.log(`✅ Created DynamoDB table '${DYNAMODB_TABLE}'`);
}

type StepFunctionsSetupParams = {
  stateMachineName?: string;
  roleArn?: string;
  definition?: string;
};

export async function ensureStepFunctionsStateMachine(
  params: StepFunctionsSetupParams = {}
): Promise<void> {
  if (!stepFunctionsClient) {
    console.warn(
      '⚠️  Step Functions client not configured; skipping state machine setup'
    );
    return;
  }

  const stateMachineName = params.stateMachineName ?? 'WageMatchSettlement';
  const definition = params.definition ?? buildMatchSettlementDefinition();

  const roleArn =
    params.roleArn ??
    process.env.MATCH_SETTLEMENT_ROLE_ARN ??
    'arn:aws:iam::000000000000:role/StepFunctionsSampleRole';

  try {
    const existing = (await stepFunctionsClient.send(
      new DescribeStateMachineCommand({
        stateMachineArn: STEP_FUNCTIONS_ARN || undefined,
        stateMachineName: STEP_FUNCTIONS_ARN ? undefined : stateMachineName,
      })
    )) as { stateMachineArn: string };

    if (existing.stateMachineArn) {
      await stepFunctionsClient.send(
        new UpdateStateMachineCommand({
          stateMachineArn: existing.stateMachineArn,
          definition,
          ...(roleArn ? { roleArn } : {}),
        })
      );
      process.env.MATCH_SETTLEMENT_STATE_MACHINE_ARN = existing.stateMachineArn;
      console.log(
        `✅ Updated Step Functions state machine '${stateMachineName}' (ARN: ${existing.stateMachineArn})`
      );
      return;
    }
  } catch (error) {
    console.warn(
      'ℹ️  Unable to describe Step Functions by name (will attempt to create new machine).',
      error instanceof Error
        ? { name: error.name, message: error.message }
        : error
    );
  }

  const created = (await stepFunctionsClient.send(
    new CreateStateMachineCommand({
      name: stateMachineName,
      definition,
      roleArn,
      type: 'STANDARD',
    })
  )) as { stateMachineArn?: string };

  process.env.MATCH_SETTLEMENT_STATE_MACHINE_ARN =
    created.stateMachineArn ?? '';
  console.log(
    `✅ Created Step Functions state machine '${stateMachineName}' (ARN: ${created.stateMachineArn})`
  );
}

export async function verifyRedis(): Promise<RedisClient> {
  const redis = createRedisClient(REDIS_URL, REDIS_TLS_REJECT);
  await redis.ping();
  console.log('✅ Redis ping successful');
  return redis;
}

export async function seedStocks(
  tickers: string[] = STOCK_TICKERS
): Promise<void> {
  await seedAssetPrices(
    tickers.map<AssetSeed>(symbol => ({
      symbol,
      name: symbol,
      assetType: 'STOCK',
    }))
  );
  console.log(`✅ Seeded ${tickers.length} stock tickers`);
}

export async function seedCryptoAssets(): Promise<void> {
  await seedAssetPrices(CRYPTO_ASSETS);
  console.log(`✅ Seeded ${CRYPTO_ASSETS.length} crypto tickers`);
}

export async function seedCommodityAssets(): Promise<void> {
  await seedAssetPrices(COMMODITY_ASSETS);
  console.log(`✅ Seeded ${COMMODITY_ASSETS.length} commodity tickers`);
}

async function seedAssetPrices(assets: AssetSeed[]): Promise<void> {
  const nowIso = new Date().toISOString();

  const uniqueKeys = new Set<string>();
  const items = assets.map(({ symbol, name, assetType }) => ({
    PutRequest: {
      Item: {
        pk: `ASSET#${assetType}`,
        sk: symbol,
        EntityType: 'AssetPrice',
        AssetType: assetType,
        Symbol: symbol,
        name: name || symbol,
        currentPrice: 0,
        lastUpdated: nowIso,
      },
    },
  }));

  const BATCH_SIZE = 25;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const filteredBatch = batch.filter(entry => {
      const key = `${entry.PutRequest.Item.pk}#${entry.PutRequest.Item.sk}`;
      if (uniqueKeys.has(key)) {
        return false;
      }
      uniqueKeys.add(key);
      return true;
    });
    if (filteredBatch.length === 0) {
      continue;
    }
    await documentClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [DYNAMODB_TABLE]: filteredBatch,
        },
      })
    );
  }
}

export function shutdownSystemPrep(): void {
  stepFunctionsClient?.destroy();
  dynamoClient.destroy();
}
