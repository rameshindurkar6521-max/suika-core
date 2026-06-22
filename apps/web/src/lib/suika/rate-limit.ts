/**
 * SUIKA X — Rate Limiter.
 *
 * In-memory token-bucket rate limiter. Each client (identified by IP or
 * session) gets a bucket per route tier. Three tiers:
 *
 *   expensive: router/completions, agent dispatch   → 10 req/min
 *   write:     memory, constitution, fabric mutations → 60 req/min
 *   read:      all GET endpoints                      → 300 req/min
 *
 * In production this should be Redis-backed; the in-memory Map works for
 * single-node deployments and is Edge-runtime-compatible.
 */
import type { NextRequest } from "next/server";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const TIERS: Record<string, { capacity: number; refillPerMin: number }> = {
  expensive: { capacity: 10, refillPerMin: 10 },
  write: { capacity: 60, refillPerMin: 60 },
  read: { capacity: 300, refillPerMin: 300 },
};

const buckets = new Map<string, Bucket>();

function getClientId(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const session = req.cookies.get("suika-session")?.value;
  if (session) return `session:${session.slice(0, 20)}`;
  return "anonymous";
}

export function getTier(
  method: string,
  pathname: string
): "expensive" | "write" | "read" {
  if (method === "GET") return "read";
  if (
    pathname.includes("/router/completions") ||
    pathname.includes("/agents/") && pathname.includes("/dispatch")
  ) {
    return "expensive";
  }
  return "write";
}

export function checkRateLimit(
  req: NextRequest
): { allowed: boolean; tier: string; remaining: number; retryAfterMs: number } {
  const tier = getTier(req.method, req.nextUrl.pathname);
  const config = TIERS[tier];
  const clientId = getClientId(req);
  const key = `${clientId}:${tier}`;
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: config.capacity, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsedMin = (now - bucket.lastRefill) / (60 * 1000);
  const refilled = Math.floor(elapsedMin * config.refillPerMin);
  if (refilled > 0) {
    bucket.tokens = Math.min(config.capacity, bucket.tokens + refilled);
    bucket.lastRefill = now;
  }

  if (bucket.tokens > 0) {
    bucket.tokens -= 1;
    return { allowed: true, tier, remaining: bucket.tokens, retryAfterMs: 0 };
  }

  // Calculate retry-after: time until 1 token refills
  const retryAfterMs = Math.ceil((1 / config.refillPerMin) * 60 * 1000);
  return { allowed: false, tier, remaining: 0, retryAfterMs };
}

// Periodic cleanup of expired buckets (every 5 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > 10 * 60 * 1000) {
        buckets.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}
