import { Request, Response } from "express";
import { metrics } from "../services/metrics";

export async function getMetrics(req: Request, res: Response) {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.exportMetrics());
} 