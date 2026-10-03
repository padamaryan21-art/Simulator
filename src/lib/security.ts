/** Request-level security helpers. Pure and unit-tested; used by the API wrapper. */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cross-site request check for state-changing requests (defence in depth on top of SameSite
 * cookies). A browser always sends Origin (or Sec-Fetch-Site) on cross-site POSTs; if either says
 * the request came from elsewhere it is rejected. Non-browser clients without those headers
 * cannot ride on a victim's cookies, so they are allowed through to normal authentication.
 */
export function isCrossSiteMutation(req: {
  method: string;
  headers: { get(name: string): string | null };
}): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host !== host;
    } catch {
      return true; // "null" or malformed origin
    }
  }
  const site = req.headers.get("sec-fetch-site");
  return Boolean(site && site !== "same-origin" && site !== "none");
}

/** Fixed-window-per-key limiter held in memory (one dashboard process). */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  /** Records a hit; returns whether it is allowed and, if not, seconds until a slot frees up. */
  check(key: string, limit: number, windowSec: number, now = Date.now()) {
    const windowMs = windowSec * 1000;
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return { ok: false as const, retryAfterSec: Math.ceil((recent[0] + windowMs - now) / 1000) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    // Opportunistic cleanup so the map cannot grow without bound.
    if (this.hits.size > 1000) {
      for (const [k, v] of this.hits) if (v.every((t) => now - t >= windowMs)) this.hits.delete(k);
    }
    return { ok: true as const };
  }
}
