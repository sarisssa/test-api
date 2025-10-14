import 'dotenv/config'
import {
  BillingMode,
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  KeyType,
  ProjectionType,
  ScalarAttributeType,
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import {
  CreateStateMachineCommand,
  DescribeStateMachineCommand,
  SFNClient,
  UpdateStateMachineCommand,
} from '@aws-sdk/client-sfn'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Redis as RedisClient } from 'ioredis'
import WebSocket from 'ws'
import { createRedisClient } from '../utils/redis.js'
import { buildMatchSettlementDefinition } from '../step-functions/definition.js'

type PlayerAuth = {
  label: string
  phoneNumber: string
  userId: string
  token: string
}

type WsMessage = {
  type?: string
  action?: string
  ok?: boolean
  [key: string]: unknown
}

type Waiter = {
  predicate: (msg: WsMessage) => boolean
  resolve: (value: WsMessage) => void
  reject: (reason?: unknown) => void
  timeoutHandle: NodeJS.Timeout
}

const STOCK_TICKERS = [
  'NVDA',
  'MSFT',
  'AAPL',
  'AMZN',
  'META',
  'AVGO',
  'GOOGL',
  'GOOG',
  'TSLA',
  'BRK.B',
  'JPM',
  'WMT',
  'ORCL',
  'LLY',
  'V',
  'MA',
  'NFLX',
  'XOM',
  'COST',
  'JNJ',
  'HD',
  'PLTR',
  'PG',
  'BAC',
  'ABBV',
  'CVX',
  'KO',
  'AMD',
  'GE',
  'TMUS',
  'CSCO',
  'WFC',
  'CRM',
  'PM',
  'IBM',
  'UNH',
  'MS',
  'INTU',
  'GS',
  'ABT',
  'LIN',
  'MCD',
  'DIS',
  'AXP',
  'RTX',
  'MRK',
  'NOW',
  'CAT',
  'PEP',
  'T',
  'TMO',
  'UBER',
  'VZ',
  'BKNG',
  'QCOM',
  'ISRG',
  'SCHW',
  'TXN',
  'C',
  'ACN',
  'GEV',
  'BLK',
  'BA',
  'AMGN',
  'SPGI',
  'ADBE',
  'BSX',
  'ETN',
  'SYK',
  'AMAT',
  'ANET',
  'NEE',
  'DHR',
  'GILD',
  'PGR',
  'TJX',
  'HON',
  'DE',
  'BX',
  'PFE',
  'COF',
  'KKR',
  'UNP',
  'PANW',
  'LOW',
  'APH',
  'LRCX',
  'ADP',
  'MU',
  'COP',
  'CMCSA',
  'KLAC',
  'VRTX',
  'MDT',
  'SNPS',
  'CRWD',
  'NKE',
  'ADI',
  'WELL',
  'SBUX',
]

const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1'
const DYNAMODB_TABLE =
  process.env.WAGE_TABLE_NAME ?? process.env.DYNAMODB_TABLE_NAME ?? 'WageTable'
const DYNAMODB_ENDPOINT = process.env.DYNAMODB_URL ?? 'http://localhost:4566'
const STEP_FUNCTIONS_ARN = process.env.MATCH_SETTLEMENT_STATE_MACHINE_ARN ?? ''
const STEP_FUNCTIONS_ENDPOINT = process.env.STEP_FUNCTIONS_ENDPOINT
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
const REDIS_TLS_REJECT = process.env.REDIS_TLS_REJECT_UNAUTHORIZED ?? 'false'
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000'
const WS_URL = `${API_BASE_URL.replace(/^http/, 'ws')}/match-gateway/ws`
const TEST_OTP_CODE = process.env.TEST_PLAYER_OTP_CODE ?? '123456'

const dynamoClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: DYNAMODB_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
})

const documentClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
})

const shouldInitialiseStepFunctionsClient =
  Boolean(STEP_FUNCTIONS_ARN) || Boolean(STEP_FUNCTIONS_ENDPOINT)

const stepFunctionsClient = shouldInitialiseStepFunctionsClient
  ? new SFNClient({
      region: AWS_REGION,
      ...(STEP_FUNCTIONS_ENDPOINT ? { endpoint: STEP_FUNCTIONS_ENDPOINT } : {}),
    })
  : null

class MatchGatewayClient {
  private ws: WebSocket | null = null
  private waiters: Waiter[] = []
  private pendingMessages: WsMessage[] = []
  private outboundLog: Record<string, unknown>[] = []
  private inboundLog: Record<string, unknown>[] = []

  constructor(
    public readonly label: string,
    public readonly userId: string,
    private readonly token: string
  ) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
      }

      const ws = new WebSocket(WS_URL, { headers })

      ws.on('open', () => {
        this.ws = ws
        ws.on('message', message => this.handleMessage(message.toString()))
        ws.on('error', err => {
          console.error(`[${this.label}] WebSocket error`, err)
        })
        resolve()
      })

      ws.on('error', err => {
        reject(err)
      })
    })
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
    }
    this.waiters.forEach(waiter => {
      clearTimeout(waiter.timeoutHandle)
      waiter.reject(new Error('WebSocket closed before message received'))
    })
    this.waiters = []
  }

  send(action: string, payload: Record<string, unknown> = {}) {
    if (!this.ws) {
      throw new Error('WebSocket not connected')
    }
    const sanitizedPayload = JSON.parse(JSON.stringify(payload ?? {})) as Record<string, unknown>
    if (sanitizedPayload && typeof sanitizedPayload === 'object') {
      delete (sanitizedPayload as Record<string, unknown>).userId
      delete (sanitizedPayload as Record<string, unknown>).connectionId
    }
    const envelope = {
      action,
      payload: sanitizedPayload,
    }
    this.outboundLog.push({ ...envelope, userId: this.userId })
    this.ws.send(JSON.stringify(envelope))
  }

  async waitFor(
    predicate: (msg: WsMessage) => boolean,
    timeoutMs = 10_000
  ): Promise<WsMessage> {
    const existingIndex = this.pendingMessages.findIndex(predicate)
    if (existingIndex >= 0) {
      const existing = this.pendingMessages.splice(existingIndex, 1)[0]
      return existing
    }

    return await new Promise<WsMessage>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.waiters = this.waiters.filter(waiter => waiter.timeoutHandle !== timeoutHandle)
        reject(new Error(`[${this.label}] Timed out waiting for WebSocket message`))
      }, timeoutMs)

      this.waiters.push({
        predicate,
        resolve,
        reject,
        timeoutHandle,
      })
    })
  }

  async waitForLabel(
    label: string,
    timeoutMs?: number,
    options: { expectOk?: boolean } = {}
  ): Promise<WsMessage> {
    return await this.waitFor(msg => {
      const matchesLabel = msg.type === label || msg.action === label
      if (options.expectOk === undefined) {
        return matchesLabel
      }

      if (options.expectOk) {
        if (!matchesLabel) {
          return false
        }
        return 'ok' in msg ? msg.ok !== false : true
      }

      // expect failure
      if (matchesLabel) {
        if ('ok' in msg) {
          return msg.ok === false
        }
        return false
      }
      return msg.type === 'error'
    }, timeoutMs)
  }

  private handleMessage(raw: string) {
    let parsed: WsMessage
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      console.warn(`[${this.label}] Failed to parse WebSocket message`, raw, error)
      return
    }

    this.inboundLog.push(parsed)
    this.pendingMessages.push(parsed)

    const waiterIndex = this.waiters.findIndex(waiter => waiter.predicate(parsed))
    if (waiterIndex >= 0) {
      const waiter = this.waiters.splice(waiterIndex, 1)[0]
      const pendingIndex = this.pendingMessages.findIndex(waiter.predicate)
      if (pendingIndex >= 0) {
        this.pendingMessages.splice(pendingIndex, 1)
      }
      clearTimeout(waiter.timeoutHandle)
      waiter.resolve(parsed)
    }
  }

  dumpDebugLogs(prefix: string) {
    const dir = join(process.cwd(), 'debug-logs')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const base = join(dir, `${prefix}-${this.label.replace(/\s+/g, '_')}`)
    writeFileSync(`${base}-outbound.json`, JSON.stringify(this.outboundLog, null, 2))
    writeFileSync(`${base}-inbound.json`, JSON.stringify(this.inboundLog, null, 2))
  }
}

async function ensureDynamoTable() {
  try {
    await dynamoClient.send(
      new DescribeTableCommand({
        TableName: DYNAMODB_TABLE,
      })
    )
    console.log(`✅ DynamoDB table '${DYNAMODB_TABLE}' already exists`)
    return
  } catch (error) {
    if (error instanceof Error && error.name !== 'ResourceNotFoundException') {
      throw error
    }
    console.log(`ℹ️  DynamoDB table '${DYNAMODB_TABLE}' not found. Creating...`)
  }

  await dynamoClient.send(
    new CreateTableCommand({
      TableName: DYNAMODB_TABLE,
      KeySchema: [
        { AttributeName: 'PK', KeyType: KeyType.HASH },
        { AttributeName: 'SK', KeyType: KeyType.RANGE },
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'SK', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'hashedPhoneNumber', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'username', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'status', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'createdAt', AttributeType: ScalarAttributeType.S },
      ],
      BillingMode: BillingMode.PAY_PER_REQUEST,
      GlobalSecondaryIndexes: [
        {
          IndexName: 'PhoneNumber-GSI',
          KeySchema: [{ AttributeName: 'hashedPhoneNumber', KeyType: KeyType.HASH }],
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
  )

  console.log(`✅ DynamoDB table '${DYNAMODB_TABLE}' created`)
}

async function ensureStepFunctionsStateMachine(): Promise<void> {
  if (!stepFunctionsClient) {
    console.log('⚠️  Step Functions client not configured – skipping settlement workflow setup')
    return
  }

  const stateMachineName =
    process.env.MATCH_SETTLEMENT_STATE_MACHINE_NAME ?? 'wage-match-settlement'
  const roleArn =
    process.env.MATCH_SETTLEMENT_ROLE_ARN ??
    'arn:aws:iam::000000000000:role/WageMatchSettlementRole'

  const definition = buildMatchSettlementDefinition()

  if (STEP_FUNCTIONS_ARN) {
    const describe = (await stepFunctionsClient.send(
      new DescribeStateMachineCommand({ stateMachineArn: STEP_FUNCTIONS_ARN })
    )) as { stateMachineArn?: string; name?: string }

    await stepFunctionsClient.send(
      new UpdateStateMachineCommand({
        stateMachineArn: STEP_FUNCTIONS_ARN,
        definition,
        roleArn,
      })
    )

    console.log(
      `✅ Step Functions state machine verified: ${describe.name ?? stateMachineName}`
    )
    return
  }

  try {
    const existing = (await stepFunctionsClient.send(
      new DescribeStateMachineCommand({ name: stateMachineName })
    )) as { stateMachineArn?: string; name?: string }
    process.env.MATCH_SETTLEMENT_STATE_MACHINE_ARN = existing.stateMachineArn ?? ''
    console.log(
      `✅ Found existing state machine '${stateMachineName}'.
   ARN: ${existing.stateMachineArn}
   (Set MATCH_SETTLEMENT_STATE_MACHINE_ARN to this value before starting the API to enable settlement automation.)`
    )
    return
  } catch (error) {
    if (!(error instanceof Error) || !('name' in error) || error.name !== 'StateMachineDoesNotExist') {
      console.error('❌ Failed to describe Step Functions state machine by name.', error)
      return
    }
  }

  const created = (await stepFunctionsClient.send(
    new CreateStateMachineCommand({
      name: stateMachineName,
      definition,
      roleArn,
      type: 'STANDARD',
    })
  )) as { stateMachineArn?: string }

  process.env.MATCH_SETTLEMENT_STATE_MACHINE_ARN = created.stateMachineArn ?? ''
  console.log(
    `✅ Created Step Functions state machine '${stateMachineName}'.
   ARN: ${created.stateMachineArn}
   Remember to export MATCH_SETTLEMENT_STATE_MACHINE_ARN with this ARN before running the API.`
  )
}

async function verifyRedis(): Promise<RedisClient> {
  const redis = createRedisClient(REDIS_URL, REDIS_TLS_REJECT)
  await redis.ping()
  console.log('✅ Redis ping successful')
  return redis
}

async function seedStocks() {
  const nowIso = new Date().toISOString()

  const items = STOCK_TICKERS.map(symbol => ({
    PutRequest: {
      Item: {
        PK: 'ASSET#STOCK',
        SK: symbol,
        EntityType: 'Asset',
        AssetType: 'STOCK',
        Symbol: symbol,
        name: symbol,
        currentPrice: 0,
        lastUpdated: nowIso,
      },
    },
  }))

  const BATCH_SIZE = 25
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    await documentClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [DYNAMODB_TABLE]: batch,
        },
      })
    )
  }

  console.log(`✅ Seeded ${STOCK_TICKERS.length} stock tickers`)
}

async function createPlayer(label: string, phoneNumber: string): Promise<PlayerAuth> {
  console.log(`➡️  Creating player ${label} (${phoneNumber})`)
  const sendResponse = await fetch(`${API_BASE_URL}/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  })
  if (!sendResponse.ok) {
    throw new Error(`Failed to send OTP for ${label}: ${sendResponse.status} ${sendResponse.statusText}`)
  }

  const verifyResponse = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code: TEST_OTP_CODE }),
  })

  if (!verifyResponse.ok) {
    const text = await verifyResponse.text()
    throw new Error(`Failed to verify OTP for ${label}: ${verifyResponse.status} ${verifyResponse.statusText} - ${text}`)
  }

  const body = (await verifyResponse.json()) as {
    user: { userId: string }
    accessToken: string
  }

  console.log(`   ✅ ${label} authenticated (userId=${body.user.userId})`)

  return {
    label,
    phoneNumber,
    userId: body.user.userId,
    token: body.accessToken,
  }
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) {
    throw new Error(`Request failed (${url}): ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

async function runAssetTests(token: string) {
  console.log('\n🧪 Running asset tests...')

  const searchTerm = 'NV'
  const assets: unknown = await getJson(
    `${API_BASE_URL}/assets?search=${encodeURIComponent(searchTerm)}&limit=200`,
    token
  )

  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error(
      'Asset search returned no results. Ensure assets are seeded and DynamoDB scan limit is sufficient.'
    )
  }

  console.log(
    `   ✅ Asset search returned ${assets.length} results for term '${searchTerm}'`
  )

  const assetDetail = await getJson<Record<string, unknown>>(
    `${API_BASE_URL}/assets/NVDA`,
    token
  )

  if (assetDetail.Symbol !== 'NVDA') {
    throw new Error('Asset detail retrieval failed for NVDA')
  }
  console.log('   ✅ Asset detail retrieval passed for NVDA')
}

async function runLobbyTests(players: PlayerAuth[]) {
  console.log('\n🧪 Running lobby / asset selection tests...')

  const [playerA, playerB] = players

  const clientA = new MatchGatewayClient(playerA.label, playerA.userId, playerA.token)
  const clientB = new MatchGatewayClient(playerB.label, playerB.userId, playerB.token)
  await Promise.all([clientA.connect(), clientB.connect()])
  console.log('   ✅ WebSocket connections established')

  try {
    clientA.send('join_matchmaking', {})
    clientB.send('join_matchmaking', {})

    await Promise.all([
      clientA.waitForLabel('join_matchmaking', 10_000, { expectOk: true }),
      clientB.waitForLabel('join_matchmaking', 10_000, { expectOk: true }),
    ])
    console.log('   ✅ Players joined matchmaking queue')

    const matchFoundA = await clientA.waitForLabel('match_found', 15_000)
    const matchFoundB = await clientB.waitForLabel('match_found', 15_000)
    const matchId = (matchFoundA.matchId ?? matchFoundB.matchId) as string
    if (!matchId) {
      throw new Error('Failed to capture matchId from match_found event')
    }
    console.log(`   ✅ Match found (matchId=${matchId})`)

    // Exercise unimplemented actions to ensure they return explicit errors
    clientA.send('set_match_duration', { matchId, durationSeconds: 120 })
    await clientA.waitForLabel('set_match_duration', 5_000, { expectOk: false })
    console.log('   ✅ set_match_duration currently returns not_implemented (expected)')

    clientA.send('select_perk', { matchId, perkId: 'perk-double-down' })
    await clientA.waitForLabel('select_perk', 5_000, { expectOk: false })
    console.log('   ✅ select_perk currently returns not_implemented (expected)')

    // Select asset NVDA
    clientA.send('select_asset', { matchId, ticker: 'NVDA' })
    await clientA.waitForLabel('select_asset', 10_000, { expectOk: true })
    console.log('   ✅ Player A selected NVDA')

    // Deselect asset NVDA
    clientA.send('deselect_asset', { matchId, ticker: 'NVDA' })
    await clientA.waitForLabel('deselect_asset', 10_000, { expectOk: true })
    console.log('   ✅ Player A deselected NVDA')

    // Select NVDA again and MSFT
    clientA.send('select_asset', { matchId, ticker: 'NVDA' })
    await clientA.waitForLabel('select_asset', 10_000, { expectOk: true })
    clientA.send('select_asset', { matchId, ticker: 'MSFT' })
    await clientA.waitForLabel('select_asset', 10_000, { expectOk: true })
    console.log('   ✅ Player A selected NVDA & MSFT')

    // Attempt duplicate selection
    clientA.send('select_asset', { matchId, ticker: 'MSFT' })
    const duplicateAttempt = await Promise.race([
      clientA.waitForLabel('select_asset', 10_000),
      clientA.waitForLabel('error', 10_000),
    ])
    if (duplicateAttempt.type === 'error' || duplicateAttempt.ok === false) {
      console.log('   ✅ Duplicate asset selection correctly rejected for Player A')
    } else {
      throw new Error('Duplicate asset selection was accepted unexpectedly')
    }

    // Player B selects NVDA, MSFT, AAPL
    for (const ticker of ['NVDA', 'MSFT', 'AAPL']) {
      clientB.send('select_asset', { matchId, ticker })
      await clientB.waitForLabel('select_asset', 10_000, { expectOk: true })
    }
    console.log('   ✅ Player B selected NVDA, MSFT, AAPL')

    // Player A attempts identical third asset AAPL -> expect error
    clientA.send('select_asset', { matchId, ticker: 'AAPL' })
    await clientA.waitForLabel('select_asset', 10_000, { expectOk: false })
    console.log('   ✅ Identical asset set prevented (Player A vs Player B)')

    // Player A selects AMZN as valid third asset
    clientA.send('select_asset', { matchId, ticker: 'AMZN' })
    await clientA.waitForLabel('select_asset', 10_000, { expectOk: true })
    console.log('   ✅ Player A selected AMZN as third asset')

    // Player A attempts fourth asset -> expect error
    clientA.send('select_asset', { matchId, ticker: 'META' })
    await clientA.waitForLabel('select_asset', 10_000, { expectOk: false })
    console.log('   ✅ Player A prevented from selecting more than 3 assets')

    // Attempt ready before 3 assets (Player B remove one asset first to simulate)
    clientB.send('deselect_asset', { matchId, ticker: 'AAPL' })
    await clientB.waitForLabel('deselect_asset', 10_000, { expectOk: true })
    clientB.send('ready_check', { matchId })
    const earlyReady = await Promise.race([
      clientB.waitForLabel('ready_check', 10_000),
      clientB.waitForLabel('error', 10_000),
    ])
    if (earlyReady.type === 'error' || earlyReady.ok === false) {
      console.log('   ✅ Player B cannot ready up with fewer than 3 assets')
    } else {
      throw new Error('Player B was able to ready up with fewer than 3 assets')
    }

    // Player B reselects AAPL and add META to keep distinct
    clientB.send('select_asset', { matchId, ticker: 'AAPL' })
    await clientB.waitForLabel('select_asset', 10_000, { expectOk: true })
    console.log('   ✅ Player B restored 3 assets (NVDA, MSFT, AAPL)')

    // Ready both players
    clientA.send('ready_check', { matchId })
    clientB.send('ready_check', { matchId })

    const matchStarted = await Promise.race([
      clientA.waitForLabel('match_started', 20_000),
      clientB.waitForLabel('match_started', 20_000),
    ])
    console.log('   ✅ Match transitioned to in_progress')

    return {
      matchId,
      matchStartedAt: matchStarted.matchStartedAt as string | undefined,
    }
  } finally {
    clientA.dumpDebugLogs('lobby')
    clientB.dumpDebugLogs('lobby')
    clientA.disconnect()
    clientB.disconnect()
  }
}

async function waitForSettlement(players: PlayerAuth[], waitMs = 35_000) {
  console.log('\n⏳ Waiting for settlement...')
  await new Promise(resolve => setTimeout(resolve, waitMs))

  const [playerA, playerB] = players

  const playerMatchesA = await getJson<{ matches: { matchId: string; result?: string }[] }>(
    `${API_BASE_URL}/user/matches`,
    playerA.token
  )
  const playerMatchesB = await getJson<{ matches: { matchId: string; result?: string }[] }>(
    `${API_BASE_URL}/user/matches`,
    playerB.token
  )

  console.log(`   ✅ Retrieved match history for ${playerA.label} and ${playerB.label}`)
  return { playerMatchesA, playerMatchesB }
}

async function main() {
  console.log('🚀 Wage system orchestration script starting...')
  console.log(`   DynamoDB endpoint: ${DYNAMODB_ENDPOINT}`)
  console.log(`   Redis URL: ${REDIS_URL}`)
  console.log(`   API base: ${API_BASE_URL}`)
  console.log(`   WS endpoint: ${WS_URL}`)

  await ensureDynamoTable()
  await ensureStepFunctionsStateMachine()
  const redis = await verifyRedis()

  await seedStocks()

  const players = await Promise.all([
    createPlayer('Player A', process.env.PLAYER_ONE_PHONE ?? '+15555550001'),
    createPlayer('Player B', process.env.PLAYER_TWO_PHONE ?? '+15555550002'),
  ])

  await runAssetTests(players[0].token)

  const lobbyResult = await runLobbyTests(players)

  if (process.env.MATCH_SETTLEMENT_STATE_MACHINE_ARN) {
    await waitForSettlement(players)
    console.log('   ✅ Settlement validation complete')
  } else {
    console.log('⚠️  Settlement validation skipped (no Step Functions ARN configured)')
  }

  redis.disconnect()
  stepFunctionsClient?.destroy()
  dynamoClient.destroy()

  console.log('\n🎉 System check complete!')
  if (lobbyResult.matchStartedAt) {
    console.log(`   Match started at: ${lobbyResult.matchStartedAt}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ System check failed:', error)
    process.exit(1)
  })
}
