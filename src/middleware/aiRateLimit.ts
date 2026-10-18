import { NextFunction, Request, Response } from "express";
import { sendError } from "./errorHandler";

type RateEntry = { count: number; windowStartedAt: number };
const buckets = new Map<string, RateEntry>();

/**
 * In-memory protection for costly OCR/LLM endpoints. The key is the
 * client address. In a multi-instance production deployment, move these
 * buckets to Redis and apply an authenticated user key there.
 * For multi-instance production deployment, move these buckets to Redis.
 */
export const aiRateLimit = (maxRequests: number, windowMs: number) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${res.locals.studentId ?? req.ip}:${req.baseUrl}:${req.route?.path ?? req.path}`;
    const current = buckets.get(key);
    const entry = !current || now - current.windowStartedAt >= windowMs
      ? { count: 0, windowStartedAt: now }
      : current;

    entry.count += 1;
    buckets.set(key, entry);

    if (entry.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((windowMs - (now - entry.windowStartedAt)) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      sendError(res, `Too many AI requests. Try again in ${retryAfterSeconds} seconds.`, 429);
      return;
    }
    next();
  };
