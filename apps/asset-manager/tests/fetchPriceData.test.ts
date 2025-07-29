import axios from "axios";
import * as fetchPriceData from "../src/services/fetchPriceData";
import { logger } from "../src/utils/logger";

jest.mock("axios");
jest.mock("../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("fetchPriceData", () => {
  afterEach(() => jest.clearAllMocks());

  it("fetchStockData returns price for one symbol", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { price: "100" } });

    const data = await fetchPriceData.fetchStockData(["AAPL"]);
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining("price"), expect.anything());
    expect(data).toEqual({ AAPL: { price: "100" } });
  });

  it("handles response without price field for single symbol", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { error: "bad" } });
    const data = await fetchPriceData.fetchCryptoData(["BTC"]);
    expect(data).toEqual({});
    // For single symbol, if data doesn't have price field, it returns empty object without logging error
  });

  it("handles response without price field for multiple symbols", async () => {
    // For multiple symbols, the response should be an object with symbol keys
    // If it's not, it logs an error
    mockedAxios.get.mockResolvedValueOnce({ data: "not an object" });
    const data = await fetchPriceData.fetchCryptoData(["BTC", "ETH"]);
    expect(data).toEqual({});
    expect(logger.error).toHaveBeenCalledWith("[PRICE] Unexpected API response format:", "not an object");
  });

  it("logs axios error", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("fail"));
    const data = await fetchPriceData.fetchIndicesData(["SPY"]);
    expect(logger.error).toHaveBeenCalledWith("[PRICE] Axios error:", "fail");
    expect(data).toEqual({});
  });

  it("handles batched response for multiple symbols", async () => {
    const mockResponse = {
      AAPL: { price: "100" },
      MSFT: { price: "200" },
      BTC: { code: 400, message: "Invalid symbol" }
    };
    mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

    const data = await fetchPriceData.fetchStockData(["AAPL", "MSFT", "BTC"]);
    expect(data).toEqual({
      AAPL: { price: "100" },
      MSFT: { price: "200" }
    });
    expect(logger.error).toHaveBeenCalledWith("[PRICE] Error for symbol BTC: Invalid symbol");
  });
});
