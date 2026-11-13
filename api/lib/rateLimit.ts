import type { Request, Response, NextFunction } from "express";

const buckets = new Map<string, number[]>();

export const rateLimit = (key: string, limit: number, windowMs: number) =>
  (req: Request, res: Response, next: NextFunction) => {
    const id = `${key}:${req.ip}`;
    const now = Date.now();
    const hits = (buckets.get(id) || []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      buckets.set(id, hits);
      return res.status(429).json({ error: "Too many requests. Try again later." });
    }
    hits.push(now);
    buckets.set(id, hits);
    next();
  };