import "server-only";

import { AppError } from "@/lib/errors";

interface Bucket {
  hits: number[];
}

/**
 * Basic sliding-window rate limiter for a single-user local app. State lives
 * in process memory, so limits are per server process — enough to stop
 * accidental request storms (double clicks, runaway loops), not a security
 * boundary for a public deployment.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns seconds until a slot frees up, or 0 if the hit was allowed. */
  hit(key: string): number {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((time) => now - time < this.windowMs);
    if (bucket.hits.length >= this.limit) {
      this.buckets.set(key, bucket);
      return Math.max(1, Math.ceil((this.windowMs - (now - bucket.hits[0])) / 1000));
    }
    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    if (this.buckets.size > 1_000) this.sweep(now);
    return 0;
  }

  enforce(key: string, what: string) {
    const retryAfter = this.hit(key);
    if (retryAfter > 0) {
      throw new AppError("RATE_LIMITED", `Too many ${what}. Try again in ${retryAfter}s.`);
    }
  }

  private sweep(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.hits.every((time) => now - time >= this.windowMs)) this.buckets.delete(key);
    }
  }
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

export const generationLimiter = new RateLimiter(8, 60_000);
export const uploadLimiter = new RateLimiter(30, 60_000);
