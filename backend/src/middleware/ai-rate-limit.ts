import type { RequestHandler } from "express";

import env from "../config/env.js";
import { tooManyRequests } from "../utils/api-error.js";

const DEFAULT_MAX_REQUESTS = 5;
const DEFAULT_WINDOW_MS = 60_000;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const pruneBucket = (key: string, now: number) => {
  const bucket = buckets.get(key);
  if (!bucket) return;
  if (bucket.resetAt <= now) {
    buckets.delete(key);
  }
};

export const aiRateLimit: RequestHandler = (req, _res, next) => {
  const userId = req.authToken?.uid;
  if (!userId) {
    return next(); // auth middleware will handle missing token
  }

  const windowMs = env.AI_RATE_LIMIT_WINDOW_MS ?? DEFAULT_WINDOW_MS;
  const max = env.AI_RATE_LIMIT_MAX ?? DEFAULT_MAX_REQUESTS;
  const key = `${userId}:${req.path}`;
  const now = Date.now();

  pruneBucket(key, now);

  const bucket = buckets.get(key);
  if (!bucket) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (bucket.count >= max) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    return next(tooManyRequests(`AI requests throttled. Try again in ${retryAfterSeconds} seconds.`));
  }

  bucket.count += 1;
  return next();
};
