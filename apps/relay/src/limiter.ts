// The relay's rate limit (plan phase P16h, R4): a token bucket per client IP, DEFAULT_LIMIT
// requests per DEFAULT_WINDOW_MS, refilled continuously. It lives in the function's memory, so on
// Vercel it is best effort: each warm instance keeps its own buckets and a cold start resets them.
// It bounds one client's burst, not total use from many IPs (README.md, "Rate limit").
export const DEFAULT_LIMIT = 120;
export const DEFAULT_WINDOW_MS = 60_000;
// Buckets kept at most; past it, full buckets go first, then the oldest.
export const DEFAULT_MAX_KEYS = 10_000;

export type Take = { ok: true } | { ok: false; retryAfterS: number };

export interface Limiter {
  take(key: string): Take;
  size(): number;
}

export interface LimiterOptions {
  limit?: number;
  windowMs?: number;
  maxKeys?: number;
  now?: () => number;
}

export function createLimiter(opts: LimiterOptions = {}): Limiter {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS;
  const now = opts.now ?? Date.now;
  const perMs = limit / windowMs;
  const buckets = new Map<string, { tokens: number; at: number }>();

  const refill = (b: { tokens: number; at: number }, t: number) => {
    b.tokens = Math.min(limit, b.tokens + (t - b.at) * perMs);
    b.at = t;
  };

  // Makes room for one more bucket, before it is added.
  const evict = (t: number) => {
    for (const [k, b] of buckets) {
      if (buckets.size < maxKeys) return;
      refill(b, t);
      if (b.tokens >= limit) buckets.delete(k);
    }
    for (const k of buckets.keys()) {
      if (buckets.size < maxKeys) return;
      buckets.delete(k);
    }
  };

  return {
    take(key) {
      const t = now();
      let b = buckets.get(key);
      if (b === undefined) {
        evict(t);
        b = { tokens: limit, at: t };
        buckets.set(key, b);
      } else refill(b, t);
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return { ok: true };
      }
      return { ok: false, retryAfterS: Math.max(1, Math.ceil((1 - b.tokens) / perMs / 1000)) };
    },
    size: () => buckets.size,
  };
}
