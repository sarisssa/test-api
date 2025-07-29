interface Metrics {
  apiCalls: {
    total: number;
    success: number;
    failed: number;
    byEndpoint: Record<string, { total: number; success: number; failed: number }>;
  };
  redis: {
    operations: number;
    errors: number;
    pipelineBatches: number;
  };
  scheduler: {
    priceUpdates: number;
    quoteUpdates: number;
    symbolRegenerations: number;
    lastRun: Record<string, Date>;
  };
  performance: {
    apiResponseTimes: number[];
    redisResponseTimes: number[];
    updateDurations: number[];
  };
}

class MetricsService {
  private metrics: Metrics;

  constructor() {
    this.metrics = {
      apiCalls: {
        total: 0,
        success: 0,
        failed: 0,
        byEndpoint: {},
      },
      redis: {
        operations: 0,
        errors: 0,
        pipelineBatches: 0,
      },
      scheduler: {
        priceUpdates: 0,
        quoteUpdates: 0,
        symbolRegenerations: 0,
        lastRun: {},
      },
      performance: {
        apiResponseTimes: [],
        redisResponseTimes: [],
        updateDurations: [],
      },
    };
  }

  recordApiCall(endpoint: string, success: boolean, duration: number) {
    this.metrics.apiCalls.total++;
    
    if (success) {
      this.metrics.apiCalls.success++;
    } else {
      this.metrics.apiCalls.failed++;
    }

    if (!this.metrics.apiCalls.byEndpoint[endpoint]) {
      this.metrics.apiCalls.byEndpoint[endpoint] = { total: 0, success: 0, failed: 0 };
    }

    this.metrics.apiCalls.byEndpoint[endpoint].total++;
    if (success) {
      this.metrics.apiCalls.byEndpoint[endpoint].success++;
    } else {
      this.metrics.apiCalls.byEndpoint[endpoint].failed++;
    }

    this.metrics.performance.apiResponseTimes.push(duration);
    // keep only last 100 response times to prevent memory bloat
    if (this.metrics.performance.apiResponseTimes.length > 100) {
      this.metrics.performance.apiResponseTimes.shift();
    }
  }

  recordRedisOperation(success: boolean, duration: number) {
    this.metrics.redis.operations++;
    
    if (!success) {
      this.metrics.redis.errors++;
    }

    this.metrics.performance.redisResponseTimes.push(duration);
    // keep only last 100 response times
    if (this.metrics.performance.redisResponseTimes.length > 100) {
      this.metrics.performance.redisResponseTimes.shift();
    }
  }

  recordPipelineBatch() {
    this.metrics.redis.pipelineBatches++;
  }

  recordSchedulerRun(type: string, success: boolean, duration: number) {
    switch (type) {
      case 'price':
        this.metrics.scheduler.priceUpdates++;
        break;
      case 'quote':
        this.metrics.scheduler.quoteUpdates++;
        break;
      case 'symbols':
        this.metrics.scheduler.symbolRegenerations++;
        break;
    }

    this.metrics.scheduler.lastRun[type] = new Date();
    this.metrics.performance.updateDurations.push(duration);
    
    // keep only last 50 update durations
    if (this.metrics.performance.updateDurations.length > 50) {
      this.metrics.performance.updateDurations.shift();
    }
  }

  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  getHealthData() {
    const totalApiCalls = this.metrics.apiCalls.total;
    const successRate = totalApiCalls > 0 ? this.metrics.apiCalls.success / totalApiCalls : 0;
    const redisErrorRate = this.metrics.redis.operations > 0 ? this.metrics.redis.errors / this.metrics.redis.operations : 0;

    return {
      status: 'healthy',
      uptime: process.uptime(),
      metrics: {
        totalApiCalls,
        successRate: Math.round(successRate * 100) / 100,
        lastPriceUpdate: this.metrics.scheduler.lastRun.price,
        lastQuoteUpdate: this.metrics.scheduler.lastRun.quote,
        redisErrorRate: Math.round(redisErrorRate * 100) / 100,
        pipelineBatches: this.metrics.redis.pipelineBatches,
      }
    };
  }

  exportMetrics(): string {
    const avgApiResponseTime = this.metrics.performance.apiResponseTimes.length > 0 
      ? this.metrics.performance.apiResponseTimes.reduce((a, b) => a + b, 0) / this.metrics.performance.apiResponseTimes.length 
      : 0;

    const avgRedisResponseTime = this.metrics.performance.redisResponseTimes.length > 0 
      ? this.metrics.performance.redisResponseTimes.reduce((a, b) => a + b, 0) / this.metrics.performance.redisResponseTimes.length 
      : 0;

    return `
# HELP asset_manager_api_calls_total total number of api calls
# TYPE asset_manager_api_calls_total counter
asset_manager_api_calls_total{endpoint="price",status="success"} ${this.metrics.apiCalls.byEndpoint.price?.success || 0}
asset_manager_api_calls_total{endpoint="price",status="failed"} ${this.metrics.apiCalls.byEndpoint.price?.failed || 0}
asset_manager_api_calls_total{endpoint="quote",status="success"} ${this.metrics.apiCalls.byEndpoint.quote?.success || 0}
asset_manager_api_calls_total{endpoint="quote",status="failed"} ${this.metrics.apiCalls.byEndpoint.quote?.failed || 0}

# HELP asset_manager_redis_operations_total total number of redis operations
# TYPE asset_manager_redis_operations_total counter
asset_manager_redis_operations_total{status="success"} ${this.metrics.redis.operations - this.metrics.redis.errors}
asset_manager_redis_operations_total{status="failed"} ${this.metrics.redis.errors}

# HELP asset_manager_pipeline_batches_total total number of pipeline batches
# TYPE asset_manager_pipeline_batches_total counter
asset_manager_pipeline_batches_total ${this.metrics.redis.pipelineBatches}

# HELP asset_manager_scheduler_runs_total total number of scheduler runs
# TYPE asset_manager_scheduler_runs_total counter
asset_manager_scheduler_runs_total{type="price"} ${this.metrics.scheduler.priceUpdates}
asset_manager_scheduler_runs_total{type="quote"} ${this.metrics.scheduler.quoteUpdates}
asset_manager_scheduler_runs_total{type="symbols"} ${this.metrics.scheduler.symbolRegenerations}

# HELP asset_manager_api_response_time_seconds average api response time
# TYPE asset_manager_api_response_time_seconds gauge
asset_manager_api_response_time_seconds ${avgApiResponseTime / 1000}

# HELP asset_manager_redis_response_time_seconds average redis response time
# TYPE asset_manager_redis_response_time_seconds gauge
asset_manager_redis_response_time_seconds ${avgRedisResponseTime / 1000}
  `.trim();
  }
}

export const metrics = new MetricsService(); 