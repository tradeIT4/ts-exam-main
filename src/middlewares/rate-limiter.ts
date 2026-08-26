import type { IncomingMessage, ServerResponse } from "node:http";
import { getClientIp, type AuthenticatedRequest } from "./auth.js";
import { sendError } from "../serializers/response.js";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export interface RateLimiterOptions {
  windowMs?: number; // default: 60,000 (1 minute)
  maxRequests?: number; // default: 120 per minute
}

export class RateLimiter {
  private hits = new Map<string, RateLimitRecord>();
  private windowMs: number;
  private maxRequests: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: RateLimiterOptions = {}) {
    this.windowMs = options.windowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
    this.maxRequests = options.maxRequests ?? Number(process.env.RATE_LIMIT_MAX ?? 120);

    // Periodic cleanup of expired entries
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.hits.entries()) {
        if (record.resetTime <= now) {
          this.hits.delete(key);
        }
      }
    }, 60_000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  destroy() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }

  check(req: AuthenticatedRequest, res: ServerResponse): boolean {
    const key = req.client?.id ?? getClientIp(req);
    const now = Date.now();

    let record = this.hits.get(key);
    if (!record || record.resetTime <= now) {
      record = { count: 1, resetTime: now + this.windowMs };
      this.hits.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, this.maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader("X-RateLimit-Limit", this.maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", resetSeconds.toString());

    if (record.count > this.maxRequests) {
      res.setHeader("Retry-After", resetSeconds.toString());
      sendError(res, 429, "Too many requests. Rate limit exceeded. Please try again later.", {
        rate_limit: [`Limit of ${this.maxRequests} requests per minute exceeded. Try again in ${resetSeconds} seconds.`],
      });
      return false;
    }

    return true;
  }
}
