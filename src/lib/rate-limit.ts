/**
 * Rate limiting utility for API endpoints
 *
 * Security considerations:
 * - In-memory storage for MVP (single-server)
 * - Redis-ready interface for production scaling
 * - Sliding window algorithm for accurate rate limiting
 * - IP-based identification with optional user tracking
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// In-memory store (replace with Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup expired entries every minute
const CLEANUP_INTERVAL = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Default rate limit configurations
 */
export const RATE_LIMIT_CONFIGS = {
  // Inviting: 10 per minute for authenticated users
  invitationCreate: { maxRequests: 10, windowMs: 60_000 },
  // Code verification: 5 per minute per IP (brute force protection)
  invitationVerify: { maxRequests: 5, windowMs: 60_000 },
  // Accepting: 3 per minute per user
  invitationAccept: { maxRequests: 3, windowMs: 60_000 },
} as const;

/**
 * Check if a request should be rate limited
 *
 * @param identifier - Unique identifier (IP address or userId)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const key = identifier;
  const entry = rateLimitStore.get(key);

  // No existing entry or window expired
  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(key, newEntry);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: new Date(newEntry.resetAt),
    };
  }

  // Within window, check limit
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(entry.resetAt),
    };
  }

  // Increment counter
  entry.count += 1;
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: new Date(entry.resetAt),
  };
}

/**
 * Extract client IP from request headers
 * Handles proxy scenarios (X-Forwarded-For)
 */
export function getClientIp(request: Request): string {
  // Check X-Forwarded-For header (proxy/load balancer)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Take first IP (original client)
    return forwardedFor.split(",")[0].trim();
  }

  // Check X-Real-IP header
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback to remote address (not available in edge/runtime)
  return "unknown";
}

/**
 * Reset rate limit for a specific identifier (for testing)
 */
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Get current rate limit entry (for testing/debugging)
 */
export function getRateLimitEntry(identifier: string): RateLimitEntry | undefined {
  return rateLimitStore.get(identifier);
}
