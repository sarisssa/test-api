import { Request, Response } from "express";
import { metrics } from "../services/metrics";

export async function getHealth(req: Request, res: Response) {
  const healthData = metrics.getHealthData();
  res.json(healthData);
} 