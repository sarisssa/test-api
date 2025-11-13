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

export const PREDEFINED_CHAT_MESSAGES = {
  GG: 'GG',
  NOOOO: 'Noooo',
  LOG_OFF: 'Log off.',
  COME_ON: 'Come on.',
  LET_S_GOOO: "Let's gooo.",
  REALLY: 'Really?',
  TOO_EASY_NEXT: 'Too easy, next',
  OOF: 'Oof',
  WELL_PLAYED: 'Well played',
  I_M_GETTING_COOKED: "I'm getting cooked.",
  GET_ON_MY_LEVEL: 'Get on my level.',
  NICE: 'Nice',
  WHEW: 'Whew',
  YOU_DON_T_MISS: "You don't miss.",
  THAT_S_WILD: "That's wild.",
  YOU_RE_BUILT_DIFFERENT: "You're built different.",
  CENSORED: '!@#$%@%',
  NO_CHANCE: 'No chance',
  SORRY: 'Sorry!',
} as const;

export type ChatMessageId = keyof typeof PREDEFINED_CHAT_MESSAGES;

export const MAX_CHAT_MESSAGES_PER_PLAYER = 5;
