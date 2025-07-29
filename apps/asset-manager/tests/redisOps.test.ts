// NOTE: All Redis operations in these tests are MOCKED. These tests verify that the correct keys and values are used.
// The purpose is to test structure and logic, not actual database persistence.

import * as redisOps from "../src/db/redisOps";
import redis from "../src/config/redis";
import { logger } from "../src/utils/logger";

jest.mock("../src/config/redis");
jest.mock("../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedRedis = redis as jest.Mocked<typeof redis>;

describe("setAssetData", () => {
  afterEach(() => jest.clearAllMocks());

  it("merges existing Redis data and sets updated hash", async () => {
    mockedRedis.hgetall.mockResolvedValueOnce({ 
      price: "100", 
      type: "stock",
      name: "Apple Inc.",
      exchange: "NASDAQ"
    });

    await redisOps.setAssetData("AAPL", { 
      updated_at: "2024-01-15T10:30:00.000Z", 
      price: "110" 
    });

    expect(mockedRedis.hgetall).toHaveBeenCalledWith("asset:AAPL");
    expect(mockedRedis.hmset).toHaveBeenCalledWith("asset:AAPL", {
      price: "110",           // overwritten
      type: "stock",          // preserved
      name: "Apple Inc.",     // preserved
      exchange: "NASDAQ",     // preserved
      currency: undefined,    // not provided
      average_volume: undefined,
      rolling_1day_change: undefined,
      rolling_7day_change: undefined,
      rolling_period_change: undefined,
      fifty_two_week_low: undefined,
      fifty_two_week_high: undefined,
      fifty_two_week_range: undefined,
      updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) // ISO timestamp
    });
  });

  it("handles empty existing data", async () => {
    mockedRedis.hgetall.mockResolvedValueOnce({});

    await redisOps.setAssetData("NEW", { 
      price: "50", 
      type: "crypto",
      name: "New Coin"
    });

    expect(mockedRedis.hgetall).toHaveBeenCalledWith("asset:NEW");
    expect(mockedRedis.hmset).toHaveBeenCalledWith("asset:NEW", {
      price: "50",
      type: "crypto",
      name: "New Coin",
      exchange: undefined,
      currency: undefined,
      average_volume: undefined,
      rolling_1day_change: undefined,
      rolling_7day_change: undefined,
      rolling_period_change: undefined,
      fifty_two_week_low: undefined,
      fifty_two_week_high: undefined,
      fifty_two_week_range: undefined,
      updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    });
  });
});

describe("getAssetData", () => {
  afterEach(() => jest.clearAllMocks());

  it("retrieves asset data from Redis", async () => {
    const mockData = {
      price: "150.25",
      name: "Apple Inc.",
      exchange: "NASDAQ",
      currency: "USD",
      type: "stock",
      updated_at: "2024-01-15T10:30:00.000Z"
    };

    mockedRedis.hgetall.mockResolvedValueOnce(mockData);

    const result = await redisOps.getAssetData("AAPL");

    expect(mockedRedis.hgetall).toHaveBeenCalledWith("asset:AAPL");
    expect(result).toEqual(mockData);
  });

  it("returns empty object for non-existent asset", async () => {
    mockedRedis.hgetall.mockResolvedValueOnce({});

    const result = await redisOps.getAssetData("INVALID");

    expect(mockedRedis.hgetall).toHaveBeenCalledWith("asset:INVALID");
    expect(result).toEqual({});
  });
});