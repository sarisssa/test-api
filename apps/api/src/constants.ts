export const MATCHMAKING_JOB_QUEUE_LIST = 'matchmaking:jobs:list';
export const MATCHMAKING_PLAYER_QUEUE_ZSET = 'matchmaking:players:zset';
export const WEBSOCKET_OUTGOING_CHANNEL = 'websocket:outgoing_messages';
export const MONITORED_SYMBOLS_HOT_ZSET = 'monitored_symbols:hot';
export const HOT_SYMBOLS_WINDOW_MS = 90 * 1000; // 90 seconds
export const MAX_ASSETS_PER_PLAYER = 3;
export const TWELVE_DATA_API_BASE_URL = 'https://api.twelvedata.com';

export const INITIAL_PORTFOLIO_VALUE = 100000;
export const REQUIRED_ASSET_COUNT = 3;

export const REDIS_KEYS = {
  PLAYER: (userId: string) => `player:${userId}`,
  CONNECTION: (connectionId: string) => `connection:${connectionId}`,
  MATCH: (matchId: string) => `match:${matchId}`,
  ASSET_TICKER: (ticker: string) => `asset:ticker:${ticker.toUpperCase()}`,
} as const;
