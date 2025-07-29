import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { startScheduler } from "./scheduler/cron";
import { getAsset } from "./api/getAsset";
import { getMetrics } from "./api/metrics";
import { getHealth } from "./api/health";
import { logger } from "./utils/logger";

const app = express();
const PORT = process.env.PORT || 3000;

// middleware
app.use(express.json());

// routes
app.get('/getAsset', getAsset);
app.get('/metrics', getMetrics);
app.get('/health', getHealth);

// start server
app.listen(PORT, () => {
  logger.info(`🚀 Asset cache system started on port ${PORT}`);
});

// start scheduler
startScheduler();