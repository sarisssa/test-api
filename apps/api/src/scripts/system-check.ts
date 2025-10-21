import 'dotenv/config'
import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Redis as RedisClient } from 'ioredis'
import WebSocket from 'ws'
import { INITIAL_PORTFOLIO_VALUE } from '../constants.js'
import { handler as computeOutcomeHandler } from '../step-functions/handlers/compute-outcome.js'
import type { DynamoDBMatchItem } from '../models/match.js'
import {
  DYNAMODB_ENDPOINT,
  DYNAMODB_TABLE,
  REDIS_URL,
  documentClient,
  ensureDynamoTable as ensureDynamoTableTask,
  ensureStepFunctionsStateMachine as ensureStepFunctionsStateMachineTask,
  seedCommodityAssets as seedCommodityAssetsTask,
  seedCryptoAssets as seedCryptoAssetsTask,
  seedStocks as seedStocksTask,
  shutdownSystemPrep,
  verifyRedis as verifyRedisTask,
} from './lib/system-prep.js'
import { CRYPTO_ASSETS, STOCK_TICKERS } from './lib/asset-lists.js'

type PlayerAuth = {
  label: string;
  phoneNumber: string;
  userId: string;
  token: string;
};

type WsMessage = {
  type?: string;
  action?: string;
  ok?: boolean;
  [key: string]: unknown;
};

type Waiter = {
  predicate: (msg: WsMessage) => boolean;
  resolve: (value: WsMessage) => void;
  reject: (reason?: unknown) => void;
  timeoutHandle: NodeJS.Timeout;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
const WS_URL = `${API_BASE_URL.replace(/^http/, 'ws')}/match-gateway/ws`;
const TEST_OTP_CODE = process.env.TEST_PLAYER_OTP_CODE ?? '123456';

const MATCH_COMPLETION_POLL_INTERVAL_MS = 1_000;

const matchKey = (matchId: string) => ({
  pk: `MATCH#${matchId}`,
  sk: 'DETAILS',
});

const CRYPTO_TICKERS = CRYPTO_ASSETS.map(asset => asset.symbol);
const STOCK_LOBBY_TICKERS = ['NVDA', 'MSFT', 'AAPL', 'AMZN', 'META', 'TSLA'];

const STOCK_FORFEIT_ASSETS = {
  playerA: ['NVDA', 'MSFT', 'AMZN'],
  playerB: ['TSLA', 'AAPL', 'META'],
} as const;

const STOCK_TIMED_ASSETS = {
  a: ['CRM', 'LRCX', 'ADP'],
  b: ['MU', 'COP', 'CMCSA'],
} as const;

const CRYPTO_FORFEIT_ASSETS = {
  playerA: ['BTC/USD', 'ETH/USD', 'SOL/USD'],
  playerB: ['XRP/USD', 'BNB/USD', 'ADA/USD'],
} as const;

const CRYPTO_TIMED_ASSETS = {
  a: ['LINK/USD', 'AVAX/USD', 'LTC/USD'],
  b: ['DOT/USD', 'UNI/USD', 'XLM/USD'],
} as const;

type LobbyAssetPlan = {
  mode: 'stock' | 'crypto';
  primary: string;
  secondary: string;
  contested: string;
  third: string;
  fourth: string;
  pool: string[];
};

const sampleUnique = <T>(items: T[], count: number): T[] => {
  if (count > items.length) {
    throw new Error(
      `Cannot sample ${count} items from collection of size ${items.length}`
    );
  }
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
};

const buildLobbyAssetPlan = (
  mode: 'stock' | 'crypto',
  tickers: string[]
): LobbyAssetPlan => {
  if (tickers.length < 5) {
    throw new Error('Lobby asset plan requires at least 5 tickers');
  }
  return {
    mode,
    primary: tickers[0],
    secondary: tickers[1],
    contested: tickers[2],
    third: tickers[3],
    fourth: tickers[4],
    pool: tickers.slice(0, Math.min(tickers.length, 6)),
  };
};

const fetchMatchRecord = async (
  matchId: string
): Promise<DynamoDBMatchItem | undefined> => {
  const result = await documentClient.send(
    new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: matchKey(matchId),
    })
  );

  return result.Item as DynamoDBMatchItem | undefined;
};

const awaitMatchCompletion = async (
  matchId: string,
  timeoutMs = 45_000
): Promise<DynamoDBMatchItem> => {
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  let nextLogAt = startedAt

  console.log(`⏱️  Waiting for match ${matchId} to complete (timeout ${timeoutMs}ms)...`)

  while (Date.now() < deadline) {
    const match = await fetchMatchRecord(matchId);
    if (match && match.status === 'completed') {
      const duration = Date.now() - startedAt
      console.log(`✅ Match ${matchId} completed after ${duration}ms`)
      return match
    }

    const now = Date.now()
    if (now >= nextLogAt) {
      const elapsedMs = now - startedAt
      console.log(
        `⏳ Match ${matchId} still in progress after ${elapsedMs}ms; polling again in ${MATCH_COMPLETION_POLL_INTERVAL_MS}ms`
      )
      nextLogAt = now + 5_000
    }

    await new Promise(resolve => setTimeout(resolve, MATCH_COMPLETION_POLL_INTERVAL_MS))
  }

  throw new Error(`Timed out waiting for match ${matchId} to complete after ${timeoutMs}ms`)
}

const scanMatchesForUser = async (
  userId: string
): Promise<DynamoDBMatchItem[]> => {
  const { Items: matches } = await documentClient.send(
    new ScanCommand({
      TableName: DYNAMODB_TABLE,
      FilterExpression:
        '#entity = :match AND sk = :details AND contains(#players, :uid)',
      ExpressionAttributeNames: {
        '#entity': 'EntityType',
        '#players': 'players',
      },
      ExpressionAttributeValues: {
        ':match': 'Match',
        ':details': 'DETAILS',
        ':uid': userId,
      },
    })
  );
  return (matches ?? []) as DynamoDBMatchItem[];
};

const printMatchesForPlayers = async (label: string, players: PlayerAuth[]) => {
  const [a, b] = players;
  const [ma, mb] = await Promise.all([
    scanMatchesForUser(a.userId),
    scanMatchesForUser(b.userId),
  ]);
  const fmt = (m: DynamoDBMatchItem) => ({
    matchId: m.matchId,
    players: m.players,
    status: m.status,
    reason: m.completionReason,
    winner: m.winner,
  });
  console.log(`\n🔎 Matches for ${label}:`);
  console.log(`   ${a.label} (${a.userId}):`, JSON.stringify(ma.map(fmt)));
  console.log(`   ${b.label} (${b.userId}):`, JSON.stringify(mb.map(fmt)));
};

// Simple NYSE market-hours check (ET): Mon–Fri 9:30–16:00
const isStockMarketOpen = (): boolean => {
  const now = new Date();
  const eastern = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );
  const dow = eastern.getDay();
  const mins = eastern.getHours() * 60 + eastern.getMinutes();
  const isWeekday = dow >= 1 && dow <= 5;
  return isWeekday && mins >= 9 * 60 + 30 && mins < 16 * 60;
};

const calculatePortfolioTotals = (
  match: DynamoDBMatchItem,
  playerIds: string[]
): Record<string, number> => {
  return playerIds.reduce<Record<string, number>>((acc, playerId) => {
    const assets = match.playerAssets?.[playerId]?.assets ?? [];
    const total = assets.reduce((sum, asset) => {
      const shares = asset.shares ?? 0;
      const price = asset.currentPrice ?? asset.initialPrice ?? 0;
      return sum + shares * price;
    }, 0);

    acc[playerId] = total
    return acc
  }, {})
}

const ensureTestAssetMetadata = async () => {
  const timestamp = new Date().toISOString()

  type Seed = { symbol: string; name: string; assetType: 'STOCK' | 'CRYPTO' | 'COMMODITY' }
  const uniqueSeeds = new Map<string, Seed>()

  const upsertSeed = (seed: Seed) => {
    const upperSymbol = seed.symbol.toUpperCase()
    if (!uniqueSeeds.has(upperSymbol)) {
      uniqueSeeds.set(upperSymbol, { ...seed, symbol: upperSymbol, name: seed.name ?? upperSymbol })
    }
  }

  STOCK_TICKERS.forEach(symbol => {
    upsertSeed({ symbol, name: symbol, assetType: 'STOCK' })
  })

  CRYPTO_ASSETS.forEach(asset => {
    upsertSeed({ symbol: asset.symbol, name: asset.name, assetType: asset.assetType })
  })

  // Ensure any explicitly-listed crypto lobby assets (e.g., SOL/USD) are covered even if lists change.
  Object.values(CRYPTO_FORFEIT_ASSETS).forEach(group => {
    group.forEach(symbol => upsertSeed({ symbol, name: symbol, assetType: 'CRYPTO' }))
  })
  Object.values(CRYPTO_TIMED_ASSETS).forEach(group => {
    group.forEach(symbol => upsertSeed({ symbol, name: symbol, assetType: 'CRYPTO' }))
  })

  STOCK_LOBBY_TICKERS.forEach(symbol => {
    upsertSeed({ symbol, name: symbol, assetType: 'STOCK' })
  })
  Object.values(STOCK_FORFEIT_ASSETS).forEach(group => {
    group.forEach(symbol => upsertSeed({ symbol, name: symbol, assetType: 'STOCK' }))
  })
  Object.values(STOCK_TIMED_ASSETS).forEach(group => {
    group.forEach(symbol => upsertSeed({ symbol, name: symbol, assetType: 'STOCK' }))
  })

  await Promise.all(
    Array.from(uniqueSeeds.values()).map(async seed => {
      const upperSymbol = seed.symbol.toUpperCase()
      const item = {
        pk: `ASSET#${upperSymbol}`,
        sk: 'METADATA',
        EntityType: 'Asset',
        AssetType: seed.assetType,
        Symbol: upperSymbol,
        name: seed.name ?? upperSymbol,
        currentPrice: 0,
        lastUpdated: timestamp
      }

      try {
        await documentClient.send(
          new PutCommand({
            TableName: DYNAMODB_TABLE,
            Item: item,
            ConditionExpression:
              'attribute_not_exists(pk) AND attribute_not_exists(sk)'
          })
        )
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'ConditionalCheckFailedException') {
          console.warn(`⚠️  Failed to ensure metadata for ${upperSymbol}:`, error)
        }
      }
    })
  )
}

class MatchGatewayClient {
  private ws: WebSocket | null = null;
  private waiters: Waiter[] = [];
  private pendingMessages: WsMessage[] = [];
  private outboundLog: Record<string, unknown>[] = [];
  private inboundLog: Record<string, unknown>[] = [];

  constructor(
    public readonly label: string,
    public readonly userId: string,
    private readonly token: string
  ) { }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
      };

      const ws = new WebSocket(WS_URL, { headers });

      ws.on('open', () => {
        this.ws = ws;
        ws.on('message', message => this.handleMessage(message.toString()));
        ws.on('error', err => {
          console.error(`[${this.label}] WebSocket error`, err);
        });
        resolve();
      });

      ws.on('error', err => {
        reject(err);
      });
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.waiters.forEach(waiter => {
      clearTimeout(waiter.timeoutHandle);
      waiter.reject(new Error('WebSocket closed before message received'));
    });
    this.waiters = [];
  }

  send(action: string, payload: Record<string, unknown> = {}) {
    if (!this.ws) {
      throw new Error('WebSocket not connected');
    }
    const sanitizedPayload = JSON.parse(
      JSON.stringify(payload ?? {})
    ) as Record<string, unknown>;
    if (sanitizedPayload && typeof sanitizedPayload === 'object') {
      delete (sanitizedPayload as Record<string, unknown>).userId;
      delete (sanitizedPayload as Record<string, unknown>).connectionId;
    }
    const envelope = {
      action,
      payload: sanitizedPayload,
    };
    this.outboundLog.push({ ...envelope, userId: this.userId });
    this.ws.send(JSON.stringify(envelope));
  }

  async waitFor(
    predicate: (msg: WsMessage) => boolean,
    timeoutMs = 10_000,
    context?: string
  ): Promise<WsMessage> {
    const existingIndex = this.pendingMessages.findIndex(predicate);
    if (existingIndex >= 0) {
      const existing = this.pendingMessages.splice(existingIndex, 1)[0]
      if (context) {
        console.log(
          `[${this.label}] Matched queued WebSocket message for '${context}' immediately`
        )
      }
      return existing
    }

    return await new Promise<WsMessage>((resolve, reject) => {
      const startedAt = Date.now()
      let lastHeartbeatLog = 0
      const heartbeat = setInterval(() => {
        const elapsed = Date.now() - startedAt
        const descriptor = context ?? 'WebSocket message'
        if (elapsed >= 5_000 && elapsed - lastHeartbeatLog >= 5_000) {
          lastHeartbeatLog = elapsed
          console.log(`[${this.label}] Waiting ${elapsed}ms for '${descriptor}'...`)
        }
      }, 1_000)

      let timeoutHandle: NodeJS.Timeout
      const cleanup = () => {
        clearInterval(heartbeat)
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
        }
      }

      timeoutHandle = setTimeout(() => {
        this.waiters = this.waiters.filter(waiter => waiter.timeoutHandle !== timeoutHandle)
        cleanup()
        const descriptor = context ?? 'WebSocket message'
        reject(new Error(`[${this.label}] Timed out waiting for ${descriptor}`))
      }, timeoutMs)

      this.waiters.push({
        predicate,
        resolve: value => {
          cleanup()
          const elapsed = Date.now() - startedAt
          if (context) {
            console.log(
              `[${this.label}] Received '${context}' after ${elapsed}ms`
            )
          }
          resolve(value)
        },
        reject: reason => {
          cleanup()
          reject(reason)
        },
        timeoutHandle,
      });
    });
  }

  async waitForLabel(
    label: string,
    timeoutMs?: number,
    options: { expectOk?: boolean } = {}
  ): Promise<WsMessage> {
    return await this.waitFor(msg => {
      const matchesLabel = msg.type === label || msg.action === label;
      if (options.expectOk === undefined) {
        return matchesLabel;
      }

      if (options.expectOk) {
        if (!matchesLabel) {
          return false;
        }
        return 'ok' in msg ? msg.ok !== false : true;
      }

      // expect failure
      if (matchesLabel) {
        if ('ok' in msg) {
          return msg.ok === false;
        }
        return false;
      }
      return msg.type === 'error'
    }, timeoutMs, label)
  }

  private handleMessage(raw: string) {
    let parsed: WsMessage;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.warn(
        `[${this.label}] Failed to parse WebSocket message`,
        raw,
        error
      );
      return;
    }

    this.inboundLog.push(parsed);
    this.pendingMessages.push(parsed);

    const waiterIndex = this.waiters.findIndex(waiter =>
      waiter.predicate(parsed)
    );
    if (waiterIndex >= 0) {
      const waiter = this.waiters.splice(waiterIndex, 1)[0];
      const pendingIndex = this.pendingMessages.findIndex(waiter.predicate);
      if (pendingIndex >= 0) {
        this.pendingMessages.splice(pendingIndex, 1);
      }
      clearTimeout(waiter.timeoutHandle);
      waiter.resolve(parsed);
    }
  }

  dumpDebugLogs(prefix: string) {
    const dir = join(process.cwd(), 'debug-logs');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const base = join(dir, `${prefix}-${this.label.replace(/\s+/g, '_')}`);
    writeFileSync(
      `${base}-outbound.json`,
      JSON.stringify(this.outboundLog, null, 2)
    );
    writeFileSync(
      `${base}-inbound.json`,
      JSON.stringify(this.inboundLog, null, 2)
    );
  }
}

async function ensureDynamoTable() {
  await ensureDynamoTableTask();
}

async function ensureStepFunctionsStateMachine(): Promise<void> {
  await ensureStepFunctionsStateMachineTask();
}

async function verifyRedis(): Promise<RedisClient> {
  return await verifyRedisTask();
}

async function seedStocks() {
  await seedStocksTask();
  await seedCryptoAssetsTask();
  await seedCommodityAssetsTask();
}

async function createPlayer(
  label: string,
  phoneNumber: string
): Promise<PlayerAuth> {
  console.log(`➡️  Creating player ${label} (${phoneNumber})`);
  const sendResponse = await fetch(`${API_BASE_URL}/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  });
  if (!sendResponse.ok) {
    throw new Error(
      `Failed to send OTP for ${label}: ${sendResponse.status} ${sendResponse.statusText}`
    );
  }

  const verifyResponse = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code: TEST_OTP_CODE }),
  });

  if (!verifyResponse.ok) {
    const text = await verifyResponse.text();
    throw new Error(
      `Failed to verify OTP for ${label}: ${verifyResponse.status} ${verifyResponse.statusText} - ${text}`
    );
  }

  const body = (await verifyResponse.json()) as {
    user: { userId: string };
    accessToken: string;
  };

  console.log(`   ✅ ${label} authenticated (userId=${body.user.userId})`);

  return {
    label,
    phoneNumber,
    userId: body.user.userId,
    token: body.accessToken,
  };
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Request failed (${url}): ${response.status} ${response.statusText}`
    );
  }
  return (await response.json()) as T;
}

async function runAssetTests(token: string) {
  console.log('\n🧪 Running asset tests...');

  const searchTerm = 'NV';
  const assets: unknown = await getJson(
    `${API_BASE_URL}/assets?search=${encodeURIComponent(searchTerm)}&limit=200`,
    token
  );

  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error(
      'Asset search returned no results. Ensure assets are seeded and DynamoDB scan limit is sufficient.'
    );
  }

  console.log(
    `   ✅ Asset search returned ${assets.length} results for term '${searchTerm}'`
  );

  const assetDetail = await getJson<Record<string, unknown>>(
    `${API_BASE_URL}/assets/NVDA`,
    token
  );

  const detailSymbol = (assetDetail.Symbol ?? assetDetail.symbol) as string | undefined
  if (detailSymbol?.toUpperCase() !== 'NVDA') {
    throw new Error(`Asset detail retrieval failed for NVDA (received ${detailSymbol ?? 'unknown'})`)
  }
  console.log('   ✅ Asset detail retrieval passed for NVDA');
}

async function runLobbyTests(players: PlayerAuth[], plan: LobbyAssetPlan) {
  console.log(`\n🧪 Running lobby / asset selection tests (${plan.mode})...`);
  console.log(`   🎯 Asset pool: ${plan.pool.join(', ')}`);

  const [playerA, playerB] = players;

  const clientA = new MatchGatewayClient(
    playerA.label,
    playerA.userId,
    playerA.token
  );
  const clientB = new MatchGatewayClient(
    playerB.label,
    playerB.userId,
    playerB.token
  );
  await Promise.all([clientA.connect(), clientB.connect()]);
  console.log('   ✅ WebSocket connections established');

  try {
    clientA.send('join_matchmaking', {});
    clientB.send('join_matchmaking', {});

    await Promise.all([
      clientA.waitForLabel('join_matchmaking', 10_000, { expectOk: true }),
      clientB.waitForLabel('join_matchmaking', 10_000, { expectOk: true }),
    ]);
    console.log('   ✅ Players joined matchmaking queue');

    const matchFoundA = await clientA.waitForLabel('match_found', 15_000);
    const matchFoundB = await clientB.waitForLabel('match_found', 15_000);
    const matchId = (matchFoundA.matchId ?? matchFoundB.matchId) as string;
    if (!matchId) {
      throw new Error('Failed to capture matchId from match_found event');
    }
    console.log(`   ✅ Match found (matchId=${matchId})`);

    clientA.send('select_perk', { matchId, perkId: 'perk-double-down' });
    await clientA.waitForLabel('select_perk', 5_000, { expectOk: false });
    console.log(
      '   ✅ select_perk currently returns not_implemented (expected)'
    );

    const expectSelectResult = async (
      client: MatchGatewayClient,
      ticker: string,
      expectOk: boolean
    ) => {
      client.send('select_asset', { matchId, ticker });
      const result = await Promise.race([
        client.waitForLabel('select_asset', 10_000),
        client.waitForLabel('error', 10_000),
      ]);
      const succeeded = !(result.type === 'error' || result.ok === false);
      if (expectOk && !succeeded) {
        throw new Error(
          `[${client.label}] Expected select_asset success for ${ticker}, received ${JSON.stringify(result)}`
        );
      }
      if (!expectOk && succeeded) {
        throw new Error(
          `[${client.label}] Expected select_asset failure for ${ticker}, but succeeded`
        );
      }
    };

    await expectSelectResult(clientA, plan.primary, true);
    console.log(`   ✅ Player A selected ${plan.primary}`);

    clientA.send('deselect_asset', { matchId, ticker: plan.primary });
    await clientA.waitForLabel('deselect_asset', 10_000, { expectOk: true });
    console.log(`   ✅ Player A deselected ${plan.primary}`);

    await expectSelectResult(clientA, plan.primary, true);
    await expectSelectResult(clientA, plan.secondary, true);
    console.log(`   ✅ Player A selected ${plan.primary} & ${plan.secondary}`);

    await expectSelectResult(clientA, plan.secondary, false);
    console.log(
      '   ✅ Duplicate asset selection correctly rejected for Player A'
    );

    for (const ticker of [plan.primary, plan.secondary, plan.contested]) {
      await expectSelectResult(clientB, ticker, true);
    }
    console.log(
      `   ✅ Player B selected ${[plan.primary, plan.secondary, plan.contested].join(', ')}`
    );

    await expectSelectResult(clientA, plan.contested, false);
    console.log('   ✅ Identical asset set prevented (Player A vs Player B)');

    await expectSelectResult(clientA, plan.third, true);
    console.log(`   ✅ Player A selected ${plan.third} as third asset`);

    await expectSelectResult(clientA, plan.fourth, false);
    console.log('   ✅ Player A prevented from selecting more than 3 assets');

    clientB.send('deselect_asset', { matchId, ticker: plan.contested });
    await clientB.waitForLabel('deselect_asset', 10_000, { expectOk: true });
    clientB.send('ready_check', { matchId });
    const earlyReady = await Promise.race([
      clientB.waitForLabel('ready_check', 10_000),
      clientB.waitForLabel('error', 10_000),
    ]);
    if (earlyReady.type === 'error' || earlyReady.ok === false) {
      console.log('   ✅ Player B cannot ready up with fewer than 3 assets');
    } else {
      throw new Error('Player B was able to ready up with fewer than 3 assets');
    }

    await expectSelectResult(clientB, plan.contested, true);
    console.log(
      `   ✅ Player B restored 3 assets (${[plan.primary, plan.secondary, plan.contested].join(', ')})`
    );

    clientA.send('ready_check', { matchId });
    clientB.send('ready_check', { matchId });

    const matchStarted = await Promise.race([
      clientA.waitForLabel('match_started', 20_000),
      clientB.waitForLabel('match_started', 20_000),
    ]);
    console.log('   ✅ Match transitioned to in_progress');

    clientA.send('set_match_duration', { matchId, durationSeconds: 30 });
    await clientA.waitForLabel('set_match_duration', 10_000, {
      expectOk: true,
    });
    await Promise.race([
      clientA.waitForLabel('match_duration_updated', 10_000),
      clientB.waitForLabel('match_duration_updated', 10_000),
    ]);
    console.log('   ✅ Match duration shortened to 30 seconds');

    const completedMatch = await awaitMatchCompletion(matchId);
    const totals = calculatePortfolioTotals(completedMatch, [
      playerA.userId,
      playerB.userId,
    ]);
    console.log(
      `   ✅ Match completed via time expiry. Totals — Player A: ${totals[
        playerA.userId
      ].toFixed(2)}, Player B: ${totals[playerB.userId].toFixed(2)}`
    );

    return {
      matchId,
      matchStartedAt: matchStarted.matchStartedAt as string | undefined,
      completedMatch,
    };
  } finally {
    clientA.dumpDebugLogs('lobby');
    clientB.dumpDebugLogs('lobby');
    clientA.disconnect();
    clientB.disconnect();
  }
}

async function runTimedMatchScenario(
  players: PlayerAuth[],
  picks: { a: ReadonlyArray<string>; b: ReadonlyArray<string> },
  durationSeconds = 30,
  mode: 'stock' | 'crypto' = 'stock'
): Promise<{
  matchId: string;
  matchStartedAt?: string;
  completedMatch: DynamoDBMatchItem;
}> {
  console.log(`\n🧪 Running timed match scenario (${mode}) ...`);

  const [playerA, playerB] = players;

  const clientA = new MatchGatewayClient(
    playerA.label,
    playerA.userId,
    playerA.token
  );
  const clientB = new MatchGatewayClient(
    playerB.label,
    playerB.userId,
    playerB.token
  );
  await Promise.all([clientA.connect(), clientB.connect()]);
  console.log('   ✅ WebSocket connections established');

  try {
    clientA.send('join_matchmaking', {});
    clientB.send('join_matchmaking', {});

    await Promise.all([
      clientA.waitForLabel('join_matchmaking', 10_000, { expectOk: true }),
      clientB.waitForLabel('join_matchmaking', 10_000, { expectOk: true }),
    ]);
    console.log('   ✅ Players joined matchmaking queue');

    const matchFoundA = await clientA.waitForLabel('match_found', 15_000);
    const matchFoundB = await clientB.waitForLabel('match_found', 15_000);
    const matchId = (matchFoundA.matchId ?? matchFoundB.matchId) as string;
    if (!matchId) {
      throw new Error('Failed to capture matchId from match_found event');
    }
    console.log(`   ✅ Match found (matchId=${matchId})`);

    // Select assets (use provided distinct picks)
    for (const ticker of picks.a) {
      clientA.send('select_asset', { matchId, ticker });
      await clientA.waitForLabel('select_asset', 10_000, { expectOk: true });
    }
    for (const ticker of picks.b) {
      clientB.send('select_asset', { matchId, ticker });
      await clientB.waitForLabel('select_asset', 10_000, { expectOk: true });
    }
    console.log(
      `   ✅ Assets selected: A=${picks.a.join(', ')} / B=${picks.b.join(', ')}`
    );

    // Ready both players
    clientA.send('ready_check', { matchId });
    clientB.send('ready_check', { matchId });

    const matchStarted = await Promise.race([
      clientA.waitForLabel('match_started', 20_000),
      clientB.waitForLabel('match_started', 20_000),
    ]);
    console.log('   ✅ Match transitioned to in_progress');

    // Shorten duration
    clientA.send('set_match_duration', { matchId, durationSeconds });
    await clientA.waitForLabel('set_match_duration', 10_000, {
      expectOk: true,
    });
    await Promise.race([
      clientA.waitForLabel('match_duration_updated', 10_000),
      clientB.waitForLabel('match_duration_updated', 10_000),
    ]);
    console.log(`   ✅ Match duration set to ${durationSeconds} seconds`);

    const completedMatch = await awaitMatchCompletion(matchId);
    const totals = calculatePortfolioTotals(completedMatch, [
      playerA.userId,
      playerB.userId,
    ]);
    const returns = {
      [playerA.userId]:
        ((totals[playerA.userId] - INITIAL_PORTFOLIO_VALUE) /
          INITIAL_PORTFOLIO_VALUE) *
        100,
      [playerB.userId]:
        ((totals[playerB.userId] - INITIAL_PORTFOLIO_VALUE) /
          INITIAL_PORTFOLIO_VALUE) *
        100,
    };
    console.log(
      `   ✅ Timed match completed. Totals — A: ${totals[playerA.userId].toFixed(2)}, B: ${totals[playerB.userId].toFixed(2)} | Returns (%): A=${returns[playerA.userId].toFixed(2)} B=${returns[playerB.userId].toFixed(2)}`
    );

    return {
      matchId,
      matchStartedAt: matchStarted.matchStartedAt as string | undefined,
      completedMatch,
    };
  } finally {
    clientA.dumpDebugLogs('timed');
    clientB.dumpDebugLogs('timed');
    clientA.disconnect();
    clientB.disconnect();
  }
}

async function runForfeitScenario(
  players: PlayerAuth[],
  assets: { playerA: ReadonlyArray<string>; playerB: ReadonlyArray<string> },
  mode: 'stock' | 'crypto'
): Promise<{ matchId: string; completedMatch: DynamoDBMatchItem }> {
  console.log(`\n🧪 Running forfeit scenario (${mode})...`);

  const [playerA, playerB] = players;
  const clientA = new MatchGatewayClient(
    `${playerA.label} (forfeit)`,
    playerA.userId,
    playerA.token
  );
  const clientB = new MatchGatewayClient(
    `${playerB.label} (forfeit)`,
    playerB.userId,
    playerB.token
  );

  await Promise.all([clientA.connect(), clientB.connect()]);

  try {
    clientA.send('join_matchmaking', {});
    clientB.send('join_matchmaking', {});

    await Promise.all([
      clientA.waitForLabel('join_matchmaking', 10_000, { expectOk: true }),
      clientB.waitForLabel('join_matchmaking', 10_000, { expectOk: true }),
    ]);

    const matchFound = await Promise.race([
      clientA.waitForLabel('match_found', 15_000),
      clientB.waitForLabel('match_found', 15_000),
    ]);
    const matchId = matchFound.matchId as string;
    if (!matchId) {
      throw new Error(
        'Forfeit scenario failed: matchId missing from match_found event'
      );
    }

    const playerAAssets = assets.playerA;
    const playerBAssets = assets.playerB;

    for (const ticker of playerAAssets) {
      clientA.send('select_asset', { matchId, ticker });
      await clientA.waitForLabel('select_asset', 10_000, { expectOk: true });
    }

    for (const ticker of playerBAssets) {
      clientB.send('select_asset', { matchId, ticker });
      await clientB.waitForLabel('select_asset', 10_000, { expectOk: true });
    }

    clientA.send('ready_check', { matchId });
    clientB.send('ready_check', { matchId });

    // Small guard to avoid racing before server fully persists in_progress state
    await sleep(250);
    await Promise.race([
      clientA.waitForLabel('match_started', 20_000),
      clientB.waitForLabel('match_started', 20_000),
    ]);

    clientB.send('forfeit_match', { matchId });
    await clientB.waitForLabel('forfeit_match', 10_000, { expectOk: true });

    await Promise.race([
      clientA.waitForLabel('match_completed', 10_000),
      clientB.waitForLabel('match_completed', 10_000),
    ]);

    const completedMatch = await awaitMatchCompletion(matchId, 10_000);
    if (completedMatch.completionReason !== 'forfeited') {
      throw new Error(
        `Expected completionReason 'forfeited', received '${completedMatch.completionReason}'`
      );
    }

    console.log(
      `   ✅ Forfeit scenario completed (A=${playerAAssets.join(', ')}, B=${playerBAssets.join(', ')}, winner=${completedMatch.winner})`
    );

    return { matchId, completedMatch };
  } finally {
    clientA.dumpDebugLogs('forfeit');
    clientB.dumpDebugLogs('forfeit');
    clientA.disconnect();
    clientB.disconnect();
  }
}

async function verifyComputeOutcome(
  match: DynamoDBMatchItem,
  label: string
): Promise<void> {
  console.log(
    `\n🧮 Verifying compute-outcome handler for ${label} match (${match.matchId})...`
  );
  const outcome = await computeOutcomeHandler({
    matchId: match.matchId,
    tableName: DYNAMODB_TABLE,
    matchPk: matchKey(match.matchId).pk,
    matchSk: matchKey(match.matchId).sk,
  });
  console.log(`   Handler result: ${JSON.stringify(outcome)}`);
  if (
    label !== 'forfeit' &&
    match.winner &&
    match.winner !== outcome.winnerId
  ) {
    console.warn(
      `⚠️  Winner mismatch. Stored=${match.winner}, handler=${outcome.winnerId}`
    );
  }
}

async function main() {
  console.log('🚀 Wage system orchestration script starting...');
  console.log(`   DynamoDB endpoint: ${DYNAMODB_ENDPOINT}`);
  console.log(`   Redis URL: ${REDIS_URL}`);
  console.log(`   API base: ${API_BASE_URL}`);
  console.log(`   WS endpoint: ${WS_URL}`);

  await ensureDynamoTable();
  await ensureStepFunctionsStateMachine();
  const redis = await verifyRedis();

  await seedStocks()
  await ensureTestAssetMetadata()

  const [playersAB, playersCD] = await Promise.all([
    Promise.all([
      createPlayer('Player A', process.env.PLAYER_ONE_PHONE ?? '+15555550001'),
      createPlayer('Player B', process.env.PLAYER_TWO_PHONE ?? '+15555550002'),
    ]),
    Promise.all([
      createPlayer(
        'Player C',
        process.env.PLAYER_THREE_PHONE ?? '+15555550003'
      ),
      createPlayer('Player D', process.env.PLAYER_FOUR_PHONE ?? '+15555550004'),
    ]),
  ]);

  await runAssetTests(playersAB[0].token);

  const marketOpen = isStockMarketOpen();
  console.log(
    `\n📈 Market status: ${marketOpen ? 'OPEN (stocks)' : 'CLOSED (stocks) — using crypto fallback'}`
  );

  const lobbyPlan = marketOpen
    ? buildLobbyAssetPlan('stock', STOCK_LOBBY_TICKERS)
    : buildLobbyAssetPlan('crypto', sampleUnique(CRYPTO_TICKERS, 6));

  // Optional lobby smoke (runs the full asset selection flows once)
  try {
    const lobby = await runLobbyTests(playersAB, lobbyPlan);
    console.log(`\n🧪 Lobby smoke completed (matchId=${lobby.matchId})`);
  } catch (e) {
    console.warn('⚠️  Lobby smoke failed (continuing):', e);
  }

  // Run scenarios sequentially to avoid cross-pair matchmaking
  const forfeitAssets = marketOpen
    ? {
      playerA: [...STOCK_FORFEIT_ASSETS.playerA],
      playerB: [...STOCK_FORFEIT_ASSETS.playerB],
    }
    : {
      playerA: [...CRYPTO_FORFEIT_ASSETS.playerA],
      playerB: [...CRYPTO_FORFEIT_ASSETS.playerB],
    };
  const forfeitMode: 'stock' | 'crypto' = marketOpen ? 'stock' : 'crypto';
  const forfeitResult = await runForfeitScenario(
    playersAB,
    forfeitAssets,
    forfeitMode
  );

  const timedPicks = {
    a: [...CRYPTO_TIMED_ASSETS.a],
    b: [...CRYPTO_TIMED_ASSETS.b],
  };
  const timedMatch = await runTimedMatchScenario(
    playersCD,
    timedPicks,
    30,
    'crypto'
  );

  // Print current matches for both pairs
  await printMatchesForPlayers('Players A/B', playersAB);
  await printMatchesForPlayers('Players C/D', playersCD);

  // Log outcomes and percentage returns
  if (timedMatch.completedMatch) {
    await verifyComputeOutcome(timedMatch.completedMatch, 'timed');
    const ids = [playersCD[0].userId, playersCD[1].userId];
    const totals = calculatePortfolioTotals(timedMatch.completedMatch, ids);
    const returns = Object.fromEntries(
      ids.map(id => [
        id,
        ((totals[id] - INITIAL_PORTFOLIO_VALUE) / INITIAL_PORTFOLIO_VALUE) *
        100,
      ])
    );
    console.log(`\n⏱️  Timed Match ${timedMatch.matchId}`);
    console.log(`   Totals: ${JSON.stringify(totals)}`);
    console.log(`   Returns (%): ${JSON.stringify(returns)}`);
    console.log(`   Winner: ${timedMatch.completedMatch.winner}`);
    if (!ids.includes(timedMatch.completedMatch.winner ?? '')) {
      console.warn(
        '⚠️  Winner of timed match is not among C/D players. Match players:',
        JSON.stringify(timedMatch.completedMatch.players)
      );
    }
    if ((timedMatch.completedMatch.completionReason ?? '') !== 'time_expired') {
      console.warn(
        `⚠️  Timed match completionReason was '${timedMatch.completedMatch.completionReason}', expected 'time_expired'`
      );
    }
  }

  if (forfeitResult?.completedMatch) {
    await verifyComputeOutcome(forfeitResult.completedMatch, 'forfeit');
    const ids = [playersAB[0].userId, playersAB[1].userId];
    const totals = calculatePortfolioTotals(forfeitResult.completedMatch, ids);
    const returns = Object.fromEntries(
      ids.map(id => [
        id,
        ((totals[id] - INITIAL_PORTFOLIO_VALUE) / INITIAL_PORTFOLIO_VALUE) *
        100,
      ])
    );
    console.log(`\n🏳️  Forfeit Match ${forfeitResult.matchId}`);
    console.log(`   Totals: ${JSON.stringify(totals)}`);
    console.log(`   Returns (%): ${JSON.stringify(returns)}`);
    console.log(`   Winner: ${forfeitResult.completedMatch.winner}`);
    if (!ids.includes(forfeitResult.completedMatch.winner ?? '')) {
      console.warn(
        '⚠️  Winner of forfeit match is not among A/B players. Match players:',
        JSON.stringify(forfeitResult.completedMatch.players)
      );
    }
    if ((forfeitResult.completedMatch.completionReason ?? '') !== 'forfeited') {
      console.warn(
        `⚠️  Forfeit match completionReason was '${forfeitResult.completedMatch.completionReason}', expected 'forfeited'`
      );
    }
  }

  redis.disconnect();
  shutdownSystemPrep();

  console.log('\n🎉 System check complete!');
  if (timedMatch.matchStartedAt) {
    console.log(`   Timed match started at: ${timedMatch.matchStartedAt}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ System check failed:', error);
    process.exit(1);
  });
}
