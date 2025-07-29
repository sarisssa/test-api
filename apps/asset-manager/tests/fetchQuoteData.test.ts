import axios from "axios";
import { fetchQuoteData } from "../src/services/fetchQuoteData";
import { logger } from "../src/utils/logger";

jest.mock("axios");
jest.mock("../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("fetchQuoteData", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns mapped quote data for single symbol", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        name: "Test",
        exchange: "NASDAQ",
        currency: "USD",
        average_volume: "1000",
        rolling_1day_change: "1",
        rolling_7day_change: "5",
        rolling_period_change: "10",
        fifty_two_week: {
          low: "100",
          high: "200",
          range: "100-200"
        }
      }
    });

    const result = await fetchQuoteData(["AAPL"]);
    expect(result.AAPL).toMatchObject({
      name: "Test",
      exchange: "NASDAQ",
      fifty_two_week_high: "200",
    });
  });

  it("handles error response for single symbol", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { status: "error" } });

    const result = await fetchQuoteData(["FAIL"]);
    expect(result).toEqual({});
    expect(logger.info).toHaveBeenCalledWith("[QUOTE] Unexpected API response format:", { status: "error" });
  });

  it("logs axios error", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("boom"));
    await fetchQuoteData(["BAD"]);
    expect(logger.error).toHaveBeenCalledWith("[QUOTE] Axios error:", "boom");
  });

  it("handles batched response for multiple symbols", async () => {
    const mockResponse = {
      AAPL: {
        name: "Apple Inc.",
        exchange: "NASDAQ",
        currency: "USD",
        average_volume: "50000000",
        rolling_1day_change: "2.5",
        rolling_7day_change: "5.2",
        rolling_period_change: "12.3",
        fifty_two_week: {
          low: "120.50",
          high: "180.75",
          range: "120.50-180.75"
        }
      },
      MSFT: {
        name: "Microsoft Corporation",
        exchange: "NASDAQ",
        currency: "USD",
        average_volume: "30000000",
        rolling_1day_change: "1.8",
        rolling_7day_change: "3.1",
        rolling_period_change: "8.9",
        fifty_two_week: {
          low: "200.00",
          high: "350.00",
          range: "200.00-350.00"
        }
      },
      INVALID: { status: "error", message: "Invalid symbol" }
    };

    mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

    const result = await fetchQuoteData(["AAPL", "MSFT", "INVALID"]);
    
    expect(result.AAPL).toMatchObject({
      name: "Apple Inc.",
      exchange: "NASDAQ",
      currency: "USD",
      average_volume: "50000000",
      rolling_1day_change: "2.5",
      rolling_7day_change: "5.2",
      rolling_period_change: "12.3",
      fifty_two_week_low: "120.50",
      fifty_two_week_high: "180.75",
      fifty_two_week_range: "120.50-180.75"
    });

    expect(result.MSFT).toMatchObject({
      name: "Microsoft Corporation",
      exchange: "NASDAQ",
      currency: "USD",
      average_volume: "30000000",
      rolling_1day_change: "1.8",
      rolling_7day_change: "3.1",
      rolling_period_change: "8.9",
      fifty_two_week_low: "200.00",
      fifty_two_week_high: "350.00",
      fifty_two_week_range: "200.00-350.00"
    });

    expect(result.INVALID).toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith("[QUOTE] No or error data for symbol INVALID", { status: "error", message: "Invalid symbol" });
  });
});