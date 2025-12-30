import type { ApiKeyInfo } from './apiKey.js';

/**
 * In-memory cache for API key lookups
 * TTL: 5 minutes
 * 
 * Maps hashedKey -> ApiKeyInfo to avoid cross-region DB queries
 */
interface CacheEntry {
  info: ApiKeyInfo;
  expiresAt: number;
}

class ApiKeyCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly ttl = 5 * 60 * 1000; // 5 minutes in milliseconds

  /**
   * Get cached API key info
   */
  get(hashedKey: string): ApiKeyInfo | null {
    const entry = this.cache.get(hashedKey);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(hashedKey);
      return null;
    }

    return entry.info;
  }

  /**
   * Set cached API key info
   */
  set(hashedKey: string, info: ApiKeyInfo): void {
    this.cache.set(hashedKey, {
      info,
      expiresAt: Date.now() + this.ttl,
    });
  }

  /**
   * Clear cache (useful for testing or key rotation)
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove a specific key from cache
   */
  delete(hashedKey: string): void {
    this.cache.delete(hashedKey);
  }
}

// Singleton instance
let apiKeyCache: ApiKeyCache | null = null;

export function getApiKeyCache(): ApiKeyCache {
  if (!apiKeyCache) {
    apiKeyCache = new ApiKeyCache();
  }
  return apiKeyCache;
}

