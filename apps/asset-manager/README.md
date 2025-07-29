
# Asset Manager

A modular TypeScript-based asset caching and update system using Redis. Supports stocks, commodities, crypto, and indices, with real-time price updates from the Twelve Data API.

## Features
- Caches asset data (stocks, commodities, crypto, indices) in Redis for fast access
- Periodically updates asset information from Twelve Data API
- Dynamic symbol generation using Python script to fetch top-volume S&P 500 stocks
- Modular, extensible architecture
- Unified API endpoint for retrieving asset data
- Comprehensive unit tests for core logic and integrations
- Hybrid Node.js/Python setup for optimal data processing
- Redis pipeline batching for 10-50x performance improvement
- Comprehensive metrics and monitoring with Prometheus support
- Health check endpoints for operational monitoring

## Project Structure
```
base/apps/asset-manager/
├── src/
│   ├── api/
│   │   ├── getAsset.ts           # API handler to retrieve asset data from Redis
│   │   ├── health.ts             # Health check endpoint with metrics summary
│   │   └── metrics.ts            # Prometheus metrics endpoint
│   ├── config/
│   │   ├── redis.ts              # Redis client configuration
│   │   ├── symbols.json          # Generated asset symbol lists (stocks, crypto, indices, commodities)
│   │   └── generate_symbols.py   # Python script to generate dynamic symbol lists
│   ├── db/
│   │   └── redisOps.ts           # Redis operations for storing/retrieving asset data
│   ├── scheduler/
│   │   └── cron.ts               # Cron job scheduler for periodic updates
│   ├── services/
│   │   ├── assetUpdater.ts       # Batch update logic for all asset types
│   │   ├── fetchPriceData.ts     # Fetches price data from Twelve Data API
│   │   ├── fetchQuoteData.ts     # Fetches detailed quote data from Twelve Data API
│   │   └── metrics.ts            # Metrics collection and export service
│   ├── utils/
│   │   └── logger.ts             # Logging utility
│   └── index.ts                  # Application entry point with Express server
├── tests/
│   ├── assetUpdater.test.ts      # Tests for asset updating logic
│   ├── fetchPriceData.test.ts    # Tests for price API fetching logic
│   ├── fetchQuoteData.test.ts    # Tests for quote API fetching logic
│   └── redisOps.test.ts          # Tests for Redis operations
├── venv/                         # Python virtual environment (auto-created)
├── Makefile                      # Build and deployment automation
├── package.json
├── tsconfig.json
└── README.md
```

## Environment Variables
- `REDIS_URL` - Redis connection string
- `TWELVE_API_KEY` - API key for Twelve Data
- `PORT` - Server port (default: 3000)

## Setup & Running

### Prerequisites
- Node.js (v16 or higher)
- Python 3.8+ (for symbol generation)
- Redis server

### Installation & Setup

1. **Install dependencies:**
   ```sh
   make install
   ```
   This will install both Node.js dependencies and create a Python virtual environment with required packages.

2. **Configure environment:**
   - Copy `.env.example` to `.env` and fill in your values:
     ```sh
     REDIS_URL=redis://localhost:6379
     TWELVE_API_KEY=your_twelve_data_api_key
     ```

3. **Build and start the service:**
   ```sh
   make start
   ```
   This will:
   - Install Python packages
   - Build the TypeScript project
   - Generate initial symbol lists
   - Start the scheduler

### Manual Commands

- **Install only Node.js dependencies:**
  ```sh
  npm install
  ```

- **Build TypeScript:**
  ```sh
  npm run build
  ```

- **Run in development mode:**
  ```sh
  npm run dev
  ```

- **Clean all dependencies:**
  ```sh
  make clean
  ```

## Scheduler Configuration

The application runs three scheduled tasks:

1. **Price Updates** (Every minute): Fetches current prices for all assets
2. **Quote Updates** (Every 4 hours): Fetches detailed market data including volume, 52-week ranges, etc.
3. **Symbol Regeneration** (Every 24 hours): Updates the asset symbol lists using the Python script

## Symbol Management

### Dynamic Stock Selection
- Fetches S&P 500 companies from Wikipedia
- Downloads daily volume data using `yfinance`
- Selects top 100 stocks by volume
- Falls back to hardcoded list if dynamic fetching fails

### Asset Categories
- **Stocks**: Top 100 S&P 500 by volume (dynamically generated)
- **Crypto**: 25 major cryptocurrencies (hardcoded)
- **Indices**: SPY, QQQ, IWM, DIA (hardcoded)
- **Commodities**: XAU/USD (hardcoded)

## API Usage

### Get Asset Data
```http
GET /getAsset?symbol=AAPL
```

**Response:**
```json
{
  "price": "150.25",
  "name": "Apple Inc.",
  "exchange": "NASDAQ",
  "currency": "USD",
  "average_volume": "50000000",
  "rolling_1day_change": "2.5",
  "rolling_7day_change": "5.2",
  "rolling_period_change": "12.3",
  "fifty_two_week_low": "120.50",
  "fifty_two_week_high": "180.75",
  "fifty_two_week_range": "120.50-180.75",
  "updated_at": "2024-01-15T10:30:00.000Z",
  "type": "stock"
}
```

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "metrics": {
    "totalApiCalls": 150,
    "successRate": 0.98,
    "lastPriceUpdate": "2024-01-15T10:30:00.000Z",
    "lastQuoteUpdate": "2024-01-15T08:00:00.000Z",
    "redisErrorRate": 0.01,
    "pipelineBatches": 25
  }
}
```

### Metrics (Prometheus Format)
```http
GET /metrics
```

**Response:**
```
# HELP asset_manager_api_calls_total total number of api calls
# TYPE asset_manager_api_calls_total counter
asset_manager_api_calls_total{endpoint="price",status="success"} 120
asset_manager_api_calls_total{endpoint="price",status="failed"} 2
asset_manager_api_calls_total{endpoint="quote",status="success"} 30
asset_manager_api_calls_total{endpoint="quote",status="failed"} 1

# HELP asset_manager_redis_operations_total total number of redis operations
# TYPE asset_manager_redis_operations_total counter
asset_manager_redis_operations_total{status="success"} 1500
asset_manager_redis_operations_total{status="failed"} 5

# HELP asset_manager_pipeline_batches_total total number of pipeline batches
# TYPE asset_manager_pipeline_batches_total counter
asset_manager_pipeline_batches_total 25
```

## Testing

This project uses **Jest** for unit testing with comprehensive test coverage.

### Running Tests

```sh
make test
```

or

```sh
npm test
```

### Test Coverage

- **Asset Updater Tests** (`assetUpdater.test.ts`):
  - Verifies price and quote data updates for all supported asset types
  - Tests batch processing logic
  - Ensures proper Redis storage calls

- **API Fetching Tests** (`fetchPriceData.test.ts`, `fetchQuoteData.test.ts`):
  - Tests API endpoint calls and parameter usage
  - Validates response parsing and error handling
  - Ensures proper data transformation

- **Redis Operations Tests** (`redisOps.test.ts`):
  - Tests Redis storage and retrieval operations
  - Verifies data merging logic
  - Ensures proper key naming and hash operations

### Test Features
- **Full Mocking**: External API calls and Redis operations are mocked
- **Isolated Testing**: Each test runs independently with clean state
- **Error Scenarios**: Tests cover error handling and edge cases
- **Data Validation**: Ensures correct data structure and transformation

## Data Storage

### Redis Schema
- **Key Format**: `asset:{symbol}` (e.g., `asset:AAPL`)
- **Data Type**: Redis Hash
- **TTL**: None (persistent until explicitly updated)
- **Fields**: price, name, exchange, currency, volume data, technical indicators, timestamps

### Data Merging Strategy
- New data merges with existing data
- Unchanged fields are preserved
- `updated_at` timestamp is always refreshed
- Asset type is maintained across updates

## Limitations & Considerations

1. **API Rate Limits**: Twelve Data free plan limits to 8 requests/minute
2. **Symbol Generation**: Requires Python environment and internet access
3. **Data Freshness**: Price data updates every minute, quotes every 4 hours
4. **Error Handling**: Graceful degradation when API calls fail
5. **Memory Usage**: Redis data persists indefinitely (consider cleanup strategies for production)

## Development Notes

- The application uses a hybrid approach: Node.js for the main application and Python for data processing
- Symbol generation runs on startup and every 24 hours
- All external dependencies are mocked in tests for reliability
- The Makefile automates the complex setup process
- Consider upgrading to a paid Twelve Data plan for higher rate limits and additional features