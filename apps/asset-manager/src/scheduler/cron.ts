import cron from "node-cron";
import { updatePriceData, updateQuoteData } from "../services/assetUpdater";
import { logger } from "../utils/logger";
import { metrics } from "../services/metrics";
import { exec } from "child_process";
import path from "path";

// modularized exec call for generate_symbols.py
function runGenerateSymbolsScript(): Promise<void> {
  const scriptPath = path.resolve(__dirname, "../config/generate_symbols.py");
  const venvPython = path.resolve(__dirname, "../../venv/bin/python");
  return new Promise((resolve, reject) => {
    exec(`${venvPython} ${scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        logger.error(`[SYMBOLS] Error running generate_symbols.py: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr) {
        logger.error(`[SYMBOLS] generate_symbols.py stderr: ${stderr}`);
      }
      logger.info(`[SYMBOLS] generate_symbols.py completed:\n${stdout}`);
      resolve();
    });
  });
}

export async function startScheduler() {
  
  // once we move up to a plan with enough credits to not need to use the top x stocks based on volume, 
  // throw away this cron job, throw away generate_symbols.py, and hardcode symbols.ts

  // run quote update immediately on startup
  // await updateQuoteData();

  // runs every 24 hours:
  cron.schedule("0 */24 * * *", async () => {
    const startTime = Date.now();
    logger.info("[CRON] Updating Assets (Every 24 Hours)");
    
    try {
      await runGenerateSymbolsScript();
      const duration = Date.now() - startTime;
      metrics.recordSchedulerRun('symbols', true, duration);
    } catch (err) {
      const duration = Date.now() - startTime;
      metrics.recordSchedulerRun('symbols', false, duration);
      logger.error("[CRON] Error updating symbols:", err);
    }
  });
  
  // runs every minute:
  cron.schedule("* * * * *", async () => {
    logger.info("[CRON] Updating Prices (Every Minute)");
    try {
      await updatePriceData();
    } catch (err) {
      logger.error("[CRON] Error updating prices:", err);
    }
  });

  // runs every 4 hours:
  cron.schedule("0 */4 * * *", async () => {
    logger.info("[CRON] Updating Quotes (Every 4 Hours)");
    try {
      await updateQuoteData();
    } catch (err) {
      logger.error("[CRON] Error updating quotes:", err);
    }
  });
}