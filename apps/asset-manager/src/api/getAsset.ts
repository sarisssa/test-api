import { getAssetData } from "../db/redisOps";
import { Request, Response } from "express";

export async function getAsset(req: Request, res: Response) {
  const { symbol } = req.query;
  if (!symbol || typeof symbol !== "string") {
    return res.status(400).json({ error: "Missing or Invalid Symbol" });
  }
  const data = await getAssetData(symbol.toUpperCase());
  res.json(data);
} 