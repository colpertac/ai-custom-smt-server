import { createHash } from "node:crypto"

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** Test helper — clear in-memory buckets between cases. */
export function resetRateLimitBuckets(): void {
  buckets.clear()
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number }

/**
 * Simple fixed-window limiter for a single Node process (one website container).
 * Not shared across replicas — upgrade to Redis if you scale out.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  bucket.count += 1
  return { ok: true }
}

export function clientKey(prefix: string, ip: string): string {
  const hash = createHash("sha256").update(ip).digest("hex").slice(0, 16)
  return `${prefix}:${hash}`
}

/** Best-effort client IP behind Docker / reverse proxy. */
export function clientIpFromHeaders(h: Headers): string {
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }
  return h.get("x-real-ip")?.trim() || "unknown"
}
