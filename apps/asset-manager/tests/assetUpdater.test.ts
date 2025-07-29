import { updatePriceData, updateQuoteData } from "../src/services/assetUpdater";
import * as fetchPriceData from "../src/services/fetchPriceData";
import * as fetchQuoteData from "../src/services/fetchQuoteData";
import * as redisOps from "../src/db/redisOps";

// Mock the symbols.json import
jest.mock("../src/config/symbols.json", () => ({
  stock: ["AAPL", "MSFT"],
  crypto: ["BTC", "ETH"],
  index: ["SPY", "QQQ"],
  commodity: ["XAU/USD"]
}));

// Mock Redis operations
jest.mock("../src/db/redisOps");

const setAssetDataMock = redisOps.setAssetData as jest.Mock;

describe("updatePriceData", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(fetchPriceData, "fetchStockData").mockResolvedValue({ 
      AAPL: { price: "100" },
      MSFT: { price: "200" }
    });
    jest.spyOn(fetchPriceData, "fetchCommoditiesData").mockResolvedValue({ 
      "XAU/USD": { price: "2500" }
    });
    jest.spyOn(fetchPriceData, "fetchCryptoData").mockResolvedValue({ 
      BTC: { price: "40000" },
      ETH: { price: "3000" }
    });
    jest.spyOn(fetchPriceData, "fetchIndicesData").mockResolvedValue({ 
      SPY: { price: "500" },
      QQQ: { price: "400" }
    });
  });

  it("stores price data in Redis for all supported asset types", async () => {
    await updatePriceData();

    expect(setAssetDataMock).toHaveBeenCalledTimes(7);
    expect(setAssetDataMock).toHaveBeenCalledWith("AAPL", expect.objectContaining({ 
      price: "100", 
      type: "stock" 
    }), expect.any(Object)); // pipeline object
    expect(setAssetDataMock).toHaveBeenCalledWith("MSFT", expect.objectContaining({ 
      price: "200", 
      type: "stock" 
    }), expect.any(Object)); // pipeline object
    expect(setAssetDataMock).toHaveBeenCalledWith("BTC", expect.objectContaining({ 
      price: "40000", 
      type: "crypto" 
    }), expect.any(Object)); // pipeline object
    expect(setAssetDataMock).toHaveBeenCalledWith("ETH", expect.objectContaining({ 
      price: "3000", 
      type: "crypto" 
    }), expect.any(Object)); // pipeline object
    expect(setAssetDataMock).toHaveBeenCalledWith("SPY", expect.objectContaining({ 
      price: "500", 
      type: "index" 
    }), expect.any(Object)); // pipeline object
    expect(setAssetDataMock).toHaveBeenCalledWith("QQQ", expect.objectContaining({ 
      price: "400", 
      type: "index" 
    }), expect.any(Object)); // pipeline object
    expect(setAssetDataMock).toHaveBeenCalledWith("XAU/USD", expect.objectContaining({ 
      price: "2500", 
      type: "commodity" 
    }), expect.any(Object)); // pipeline object
  });

  it("handles missing price data gracefully", async () => {
    jest.spyOn(fetchPriceData, "fetchStockData").mockResolvedValue({ 
      AAPL: { price: "100" }
      // MSFT missing
    });

    await updatePriceData();

    // Should still call setAssetData for AAPL
    expect(setAssetDataMock).toHaveBeenCalledWith("AAPL", expect.objectContaining({ 
      price: "100", 
      type: "stock" 
    }), expect.any(Object)); // pipeline object
  });
});

describe("updateQuoteData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("stores quote data in Redis for all supported assets", async () => {
    const mockQuoteData: Record<string, any> = {
      AAPL: { 
        name: "Apple Inc.",
        exchange: "NASDAQ",
        currency: "USD"
      },
      MSFT: { 
        name: "Microsoft Corporation",
        exchange: "NASDAQ", 
        currency: "USD"
      },
      BTC: { 
        name: "Bitcoin",
        exchange: "CRYPTO",
        currency: "USD"
      },
      ETH: { 
        name: "Ethereum",
        exchange: "CRYPTO",
        currency: "USD"
      },
      SPY: { 
        name: "SPDR S&P 500 ETF",
        exchange: "NYSE",
        currency: "USD"
      },
      QQQ: { 
        name: "Invesco QQQ Trust",
        exchange: "NASDAQ",
        currency: "USD"
      },
      "XAU/USD": { 
        name: "Gold",
        exchange: "FOREX",
        currency: "USD"
      }
    };

    jest.spyOn(fetchQuoteData, "fetchQuoteData").mockResolvedValue(mockQuoteData);

    await updateQuoteData();

    expect(setAssetDataMock).toHaveBeenCalledTimes(7);
    
    // Verify each asset type is called with correct data
    expect(setAssetDataMock).toHaveBeenCalledWith("AAPL", expect.objectContaining({
      name: "Apple Inc.",
      exchange: "NASDAQ",
      currency: "USD",
      type: "stock"
    }), expect.any(Object)); // pipeline object
    
    expect(setAssetDataMock).toHaveBeenCalledWith("BTC", expect.objectContaining({
      name: "Bitcoin",
      exchange: "CRYPTO", 
      currency: "USD",
      type: "crypto"
    }), expect.any(Object)); // pipeline object
    
    expect(setAssetDataMock).toHaveBeenCalledWith("SPY", expect.objectContaining({
      name: "SPDR S&P 500 ETF",
      exchange: "NYSE",
      currency: "USD", 
      type: "index"
    }), expect.any(Object)); // pipeline object
    
    expect(setAssetDataMock).toHaveBeenCalledWith("XAU/USD", expect.objectContaining({
      name: "Gold",
      exchange: "FOREX",
      currency: "USD",
      type: "commodity"
    }), expect.any(Object)); // pipeline object
  });

  it("handles missing quote data gracefully", async () => {
    const mockQuoteData: Record<string, any> = {
      AAPL: { name: "Apple Inc." }
      // Other symbols missing
    };

    jest.spyOn(fetchQuoteData, "fetchQuoteData").mockResolvedValue(mockQuoteData);

    await updateQuoteData();

    // Should only call setAssetData for AAPL
    expect(setAssetDataMock).toHaveBeenCalledTimes(1);
    expect(setAssetDataMock).toHaveBeenCalledWith("AAPL", expect.objectContaining({
      name: "Apple Inc.",
      type: "stock"
    }), expect.any(Object)); // pipeline object
  });
});