import { metrics } from "../src/services/metrics";

describe("MetricsService", () => {
  beforeEach(() => {
    // reset metrics before each test
    (metrics as any).metrics = {
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
  });

  describe("recordApiCall", () => {
    it("records successful api calls", () => {
      metrics.recordApiCall("price", true, 150);
      metrics.recordApiCall("quote", true, 200);

      const data = metrics.getMetrics();
      expect(data.apiCalls.total).toBe(2);
      expect(data.apiCalls.success).toBe(2);
      expect(data.apiCalls.failed).toBe(0);
      expect(data.apiCalls.byEndpoint.price.success).toBe(1);
      expect(data.apiCalls.byEndpoint.quote.success).toBe(1);
      expect(data.performance.apiResponseTimes).toEqual([150, 200]);
    });

    it("records failed api calls", () => {
      metrics.recordApiCall("price", false, 100);
      metrics.recordApiCall("quote", false, 120);

      const data = metrics.getMetrics();
      expect(data.apiCalls.total).toBe(2);
      expect(data.apiCalls.success).toBe(0);
      expect(data.apiCalls.failed).toBe(2);
      expect(data.apiCalls.byEndpoint.price.failed).toBe(1);
      expect(data.apiCalls.byEndpoint.quote.failed).toBe(1);
    });
  });

  describe("recordRedisOperation", () => {
    it("records successful redis operations", () => {
      metrics.recordRedisOperation(true, 50);
      metrics.recordRedisOperation(true, 75);

      const data = metrics.getMetrics();
      expect(data.redis.operations).toBe(2);
      expect(data.redis.errors).toBe(0);
      expect(data.performance.redisResponseTimes).toEqual([50, 75]);
    });

    it("records failed redis operations", () => {
      metrics.recordRedisOperation(false, 30);
      metrics.recordRedisOperation(true, 60);

      const data = metrics.getMetrics();
      expect(data.redis.operations).toBe(2);
      expect(data.redis.errors).toBe(1);
    });
  });

  describe("recordPipelineBatch", () => {
    it("increments pipeline batch counter", () => {
      metrics.recordPipelineBatch();
      metrics.recordPipelineBatch();

      const data = metrics.getMetrics();
      expect(data.redis.pipelineBatches).toBe(2);
    });
  });

  describe("recordSchedulerRun", () => {
    it("records different scheduler types", () => {
      metrics.recordSchedulerRun("price", true, 1000);
      metrics.recordSchedulerRun("quote", true, 2000);
      metrics.recordSchedulerRun("symbols", true, 500);

      const data = metrics.getMetrics();
      expect(data.scheduler.priceUpdates).toBe(1);
      expect(data.scheduler.quoteUpdates).toBe(1);
      expect(data.scheduler.symbolRegenerations).toBe(1);
      expect(data.performance.updateDurations).toEqual([1000, 2000, 500]);
    });

    it("records failed scheduler runs", () => {
      metrics.recordSchedulerRun("price", false, 1000);

      const data = metrics.getMetrics();
      expect(data.scheduler.priceUpdates).toBe(1);
      expect(data.performance.updateDurations).toEqual([1000]);
    });
  });

  describe("getHealthData", () => {
    it("calculates correct health metrics", () => {
      // setup some test data
      metrics.recordApiCall("price", true, 100);
      metrics.recordApiCall("price", false, 200);
      metrics.recordRedisOperation(true, 50);
      metrics.recordRedisOperation(false, 30);
      metrics.recordPipelineBatch();
      metrics.recordSchedulerRun("price", true, 1000);

      const health = metrics.getHealthData();
      
      expect(health.status).toBe("healthy");
      expect(health.metrics.totalApiCalls).toBe(2);
      expect(health.metrics.successRate).toBe(0.5); // 1 success / 2 total
      expect(health.metrics.redisErrorRate).toBe(0.5); // 1 error / 2 total
      expect(health.metrics.pipelineBatches).toBe(1);
      expect(health.metrics.lastPriceUpdate).toBeDefined();
    });
  });

  describe("exportMetrics", () => {
    it("exports prometheus format metrics", () => {
      metrics.recordApiCall("price", true, 100);
      metrics.recordApiCall("quote", false, 200);
      metrics.recordRedisOperation(true, 50);
      metrics.recordPipelineBatch();
      metrics.recordSchedulerRun("price", true, 1000);

      const prometheusMetrics = metrics.exportMetrics();
      
      expect(prometheusMetrics).toContain("asset_manager_api_calls_total");
      expect(prometheusMetrics).toContain("asset_manager_redis_operations_total");
      expect(prometheusMetrics).toContain("asset_manager_pipeline_batches_total");
      expect(prometheusMetrics).toContain("asset_manager_scheduler_runs_total");
      expect(prometheusMetrics).toContain("asset_manager_api_response_time_seconds");
      expect(prometheusMetrics).toContain("asset_manager_redis_response_time_seconds");
    });
  });
}); 