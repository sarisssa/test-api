# Asset Manager PRD

## Overview

The Asset Manager is a **real-time financial data caching and management system** that provides fast, reliable access to market data for stocks, commodities, cryptocurrencies, and indices. It operates on **periodic data updates and intelligent caching** to deliver sub-millisecond response times while optimizing external API usage.

The Asset Manager leverages **Redis caching with scheduled updates** to achieve high-performance data access in a cost-effective manner. Initial symbol generation is handled by a Python script that dynamically selects top-volume S&P 500 stocks, while ongoing price updates are managed through Node.js cron jobs.

## **Business Requirements**

1. **Real-time Price Caching**: Cache asset prices with <10ms retrieval times
2. **Multi-Asset Support**: Handle stocks, crypto, commodities, and indices in unified system
3. **Efficient API Usage**: Batch API calls and dynamic symbol selection to minimize Twelve Data costs
4. **High Availability**: Maintain 99.9% uptime with graceful error handling

### Non-Functional Requirements

- Response latency: <10ms for cached data
- Update frequency: Price updates every minute, quotes every 4 hours
- API efficiency: Minimize redundant requests through intelligent caching
- Data coverage: Support 150+ assets across 4 categories

The Asset Manager uses a **hybrid Node.js/Python architecture with Redis caching** to achieve high-performance data access while maintaining cost efficiency through intelligent symbol selection and batch processing.

## **Periodic Data Updates with Smart Caching**

The periodic update process is driven by **Node.js cron jobs with three distinct update cycles**. The system maintains three scheduled tasks:

1. **Price Updates (Every Minute)**: Fetches current prices for all assets via Twelve Data API
2. **Quote Updates (Every 4 Hours)**: Retrieves detailed market data including volume, 52-week ranges, and technical indicators
3. **Symbol Regeneration (Every 24 Hours)**: Updates asset symbol lists using Python script

Each update cycle follows a **batch processing pattern** where the system:
- Extracts all symbols from the current configuration
- Groups symbols by asset type (stocks, crypto, commodities, indices)
- Makes parallel API calls for each asset type
- Updates Redis cache with new data while preserving existing metadata
- Merges new data with existing records to maintain data completeness

The system implements **intelligent symbol selection** through a Python script that:
- Fetches S&P 500 companies from Wikipedia
- Downloads daily volume data using `yfinance`
- Selects top 100 stocks by volume
- Falls back to hardcoded list if dynamic fetching fails

### API

```typescript
// Price update every minute
export const updatePriceData = async () => {
  // 1. Fetch current prices from Twelve Data API
  // 2. Update Redis cache with new price data
  // 3. Preserve existing metadata and technical indicators
  // 4. Update timestamp for data freshness tracking
}
```

```typescript
// Quote update every 4 hours
export const updateQuoteData = async () => {
  // 1. Fetch comprehensive market data
  // 2. Update technical indicators and volume data
  // 3. Refresh 52-week ranges and other statistics
  // 4. Merge with existing price data
}
```

```typescript
// Symbol regeneration every 24 hours (Python script execution)
function runGenerateSymbolsScript(): Promise<void> {
  // 1. Execute generate_symbols.py script
  // 2. Fetch S&P 500 companies from Wikipedia
  // 3. Download daily volume data using yfinance
  // 4. Select top 100 stocks by volume
  // 5. Update symbols.json with fallback to hardcoded list
}
```

## **Data Retrieval API**

### Get Asset Data
**Endpoint**: `GET /getAsset`

**Parameters**:
- `symbol` (required): Asset symbol (e.g., AAPL, BTC/USD)

**Response**:
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

**Error Responses**:
- `400 Bad Request`: Missing or invalid symbol
- `404 Not Found`: Asset not found in cache
- `500 Internal Server Error`: System error

## **Architecture Components**

### Core Services
- **API Layer** (`src/api/`): RESTful endpoints for data retrieval
- **Data Services** (`src/services/`): Price fetching and quote data management
- **Caching Layer** (`src/db/`): Redis operations for data storage
- **Scheduler** (`src/scheduler/`): Cron job management for periodic updates
- **Configuration** (`src/config/`): Dynamic symbol lists and system settings

### Data Flow
```
Client Request → API Layer → Redis Cache → Asset Data Response
                                    ↓
                              Cache Miss → Twelve Data API → Update Cache
```

### Redis Storage Strategy
- **Key Format**: `asset:{symbol}` (e.g., `asset:AAPL`)
- **Data Type**: Redis Hash
- **TTL**: None (persistent until updated)
- **Fields**: All asset properties as hash fields

## **Asset Categories**

1. **Stocks**: Top 100 S&P 500 by volume (dynamically generated)
2. **Cryptocurrencies**: 25 major crypto assets (hardcoded)
3. **Indices**: SPY, QQQ, IWM, DIA (hardcoded)
4. **Commodities**: XAU/USD (hardcoded)

## **Technology Stack**

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for API endpoints
- **Database**: Redis for high-performance caching
- **Scheduling**: node-cron for periodic tasks
- **HTTP Client**: Axios for API requests

### Data Processing
- **Language**: Python 3.8+ for symbol generation
- **Libraries**: yfinance for market data, pandas for data processing
- **Integration**: Child process execution from Node.js

### Development & Testing
- **Testing Framework**: Jest with comprehensive mocking
- **Build Tool**: TypeScript compiler
- **Package Management**: npm with Makefile automation

## **Performance & Scalability**

### Scalability Considerations
- **Horizontal Scaling**: Stateless design supports multiple instances
- **Redis Clustering**: Can be extended to Redis Cluster for high availability
- **Load Balancing**: API endpoints can be load balanced
- **Caching Strategy**: Intelligent TTL management for optimal memory usage

## **Risk Assessment & Mitigation**

### Technical Risks
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| API Rate Limits | High | Medium | Implement request queuing and fallback strategies |
| Redis Outage | High | Low | Implement Redis clustering and failover |
| Data Staleness | Medium | Low | Regular health checks and alerting |
| Symbol Generation Failure | Medium | Low | Hardcoded fallback lists |

### Business Risks
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| API Cost Increases | Medium | Medium | Optimize request patterns and caching |
| Data Accuracy Issues | High | Low | Implement data validation and monitoring |
| Performance Degradation | High | Low | Continuous monitoring and optimization |
