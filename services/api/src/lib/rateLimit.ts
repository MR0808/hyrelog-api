import { loadConfig } from './config.js';

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per minute
}

/**
 * In-memory rate limiter using token bucket algorithm
 * 
 * Per-process implementation (document limitation for production)
 */
class RateLimiter {
  private buckets: Map<string, RateLimitBucket> = new Map();
  private config = loadConfig();

  /**
   * Check if a request should be rate limited
   * @param key - Unique identifier (API key ID or IP address)
   * @param type - 'apiKey' or 'ip'
   * @param customLimit - Optional custom limit (overrides default)
   * @returns { allowed: boolean, remaining: number, resetAt: Date }
   */
  check(key: string, type: 'apiKey' | 'ip', customLimit?: number): {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    retryAfter?: number;
  } {
    const limit = customLimit ?? (type === 'apiKey' 
      ? this.config.rateLimitApiKeyPerMin 
      : this.config.rateLimitIpPerMin);

    const bucket = this.getOrCreateBucket(key, limit);
    this.refillBucket(bucket, limit);

    const allowed = bucket.tokens > 0;
    if (allowed) {
      bucket.tokens -= 1;
    }

    const resetAt = new Date(bucket.lastRefill + 60000); // Reset in 1 minute
    const retryAfter = allowed ? undefined : Math.ceil((resetAt.getTime() - Date.now()) / 1000);

    return {
      allowed,
      remaining: Math.max(0, bucket.tokens),
      resetAt,
      retryAfter,
    };
  }

  private getOrCreateBucket(key: string, capacity: number): RateLimitBucket {
    if (!this.buckets.has(key)) {
      this.buckets.set(key, {
        tokens: capacity,
        lastRefill: Date.now(),
        capacity,
        refillRate: capacity / 60, // tokens per second
      });
    }

    return this.buckets.get(key)!;
  }

  private refillBucket(bucket: RateLimitBucket, capacity: number): void {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * (capacity / 60); // tokens per second

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  /**
   * Clear all buckets (useful for testing)
   */
  clear(): void {
    this.buckets.clear();
  }
}

// Singleton instance
let rateLimiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiter) {
    rateLimiter = new RateLimiter();
  }
  return rateLimiter;
}

