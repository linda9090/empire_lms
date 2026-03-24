/**
 * In-memory rate limiter for API endpoints.
 * For production, consider using Redis or a dedicated rate limiting service.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const limiters = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Check if a request should be rate limited.
 * @param identifier - Unique identifier (IP address, user ID, etc.)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const entry = limiters.get(identifier);

  // Clean up expired entries periodically
  if (entry && entry.resetAt < now) {
    limiters.delete(identifier);
  }

  const currentEntry = limiters.get(identifier);

  if (!currentEntry) {
    // First request or entry expired
    const resetAt = now + config.windowMs;
    limiters.set(identifier, { count: 1, resetAt });
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      resetAt: new Date(resetAt),
    };
  }

  if (currentEntry.count >= config.maxRequests) {
    // Rate limit exceeded
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      resetAt: new Date(currentEntry.resetAt),
    };
  }

  // Increment counter
  currentEntry.count++;
  return {
    allowed: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - currentEntry.count,
    resetAt: new Date(currentEntry.resetAt),
  };
}

/**
 * Reset rate limit for a specific identifier.
 * Useful for testing or administrative actions.
 */
export function resetRateLimit(identifier: string): void {
  limiters.delete(identifier);
}

/**
 * Get current rate limit status without incrementing.
 */
export function getRateLimitStatus(
  identifier: string
): RateLimitResult | null {
  const entry = limiters.get(identifier);
  if (!entry) return null;
  return {
    allowed: entry.count < 100, // Default limit
    limit: 100,
    remaining: Math.max(0, 100 - entry.count),
    resetAt: new Date(entry.resetAt),
  };
}
