import type { RequestHandler } from "express";

import env from "../config/env.js";
import { tooManyRequests } from "../utils/api-error.js";

const DEFAULT_MAX = 60;
const DEFAULT_WINDOW_MS = 10_000; // 10 seconds

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const getKey = (req: Parameters<RequestHandler>[0]): string => {
  const userId = req.authToken?.uid;
  if (userId) {
    return `user:${userId}`;
  }
  // Fallback to IP + path segment to avoid blocking all anonymous users together
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  return `ip:${ip}`;
};

const shouldBypass = (req: Parameters<RequestHandler>[0]): boolean => {
  // Allow health checks and status endpoints to pass freely
  if (req.path === "/status") {
    return true;
  }
  return false;
};

const pruneBucket = (key: string, now: number) => {
  const bucket = buckets.get(key);
  if (!bucket) return;
  if (bucket.resetAt <= now) {
    buckets.delete(key);
  }
};

export const apiRateLimit: RequestHandler = (req, _res, next) => {
  if (shouldBypass(req)) {
    return next();
  }

  const key = getKey(req);
  const now = Date.now();
  const windowMs = env.API_RATE_LIMIT_WINDOW_MS ?? DEFAULT_WINDOW_MS;
  const max = env.API_RATE_LIMIT_MAX ?? DEFAULT_MAX;

  pruneBucket(key, now);

  const bucket = buckets.get(key);

  if (!bucket) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (bucket.count >= max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return next(tooManyRequests(`Too many requests. Try again in ${retryAfterSeconds} seconds.`));
  }

  bucket.count += 1;
  return next();
};
