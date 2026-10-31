/**
 * Lightweight, in-memory sliding window rate limiter for Next.js API routes.
 * Requires zero external dependencies.
 */

type RateLimitRecord = {
  timestamps: number[]
}

class InMemoryRateLimiter {
  private store: Map<string, RateLimitRecord> = new Map()
  private maxRequests: number
  private windowMs: number
  private lastCleanup: number = Date.now()

  constructor(maxRequests: number, windowSeconds: number) {
    this.maxRequests = maxRequests
    this.windowMs = windowSeconds * 1000
  }

  /**
   * Checks whether the client identifier has exceeded rate limits.
   */
  check(identifier: string): { allowed: boolean; remaining: number; resetInSeconds: number } {
    const now = Date.now()
    this.cleanupOld(now)

    let record = this.store.get(identifier)
    if (!record) {
      record = { timestamps: [] }
      this.store.set(identifier, record)
    }

    const windowStart = now - this.windowMs
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart)

    if (record.timestamps.length >= this.maxRequests) {
      const oldest = record.timestamps[0] || now
      const resetInSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000))
      return {
        allowed: false,
        remaining: 0,
        resetInSeconds,
      }
    }

    record.timestamps.push(now)
    return {
      allowed: true,
      remaining: this.maxRequests - record.timestamps.length,
      resetInSeconds: Math.ceil(this.windowMs / 1000),
    }
  }

  private cleanupOld(now: number) {
    // Run cleanup once every 60 seconds
    if (now - this.lastCleanup < 60000) return
    this.lastCleanup = now

    const windowStart = now - this.windowMs
    for (const [key, record] of this.store.entries()) {
      record.timestamps = record.timestamps.filter((ts) => ts > windowStart)
      if (record.timestamps.length === 0) {
        this.store.delete(key)
      }
    }
  }
}

// 1. Auth limiter: 10 attempts per minute per IP
export const authRateLimiter = new InMemoryRateLimiter(10, 60)

// 2. Voice / Gemini AI limiter: 25 requests per minute per IP or User
export const voiceRateLimiter = new InMemoryRateLimiter(25, 60)

// 3. General API limiter: 120 requests per minute per User
export const apiRateLimiter = new InMemoryRateLimiter(120, 60)

/**
 * Extracts a representative client IP from standard proxy headers.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return '127.0.0.1'
}

