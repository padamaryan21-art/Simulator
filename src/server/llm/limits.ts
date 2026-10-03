/**
 * Understanding why an AI provider refused a request, and how long to leave it alone.
 * Pure functions (unit-tested): provider error text varies, so this is deliberately forgiving.
 */

export type FailureKind = "rate_limit" | "no_credit" | "other";

const HOUR = 60 * 60_000;

export function classifyFailure(status: number | undefined, message: string): FailureKind {
  if (
    /no credits|insufficient[_ ]quota|billing|payment required|exceeded your current quota/i.test(
      message,
    ) ||
    status === 402
  ) {
    return "no_credit";
  }
  if (
    status === 429 ||
    /rate.?limit|too many requests|quota|per[- ]day|tokens per/i.test(message)
  ) {
    return "rate_limit";
  }
  return "other";
}

/** Parses "try again in 6m57.6s" / "in 12s" / "in 1h2m" from a provider message into ms. */
export function parseTryAgainMs(message: string): number | null {
  const m = /try again in\s+((?:\d+(?:\.\d+)?\s*[hms]\s*)+)/i.exec(message);
  if (!m) return null;
  let ms = 0;
  for (const part of m[1].matchAll(/(\d+(?:\.\d+)?)\s*([hms])/gi)) {
    const n = Number(part[1]);
    ms +=
      part[2].toLowerCase() === "h"
        ? n * HOUR
        : part[2].toLowerCase() === "m"
          ? n * 60_000
          : n * 1000;
  }
  return ms > 0 ? Math.round(ms) : null;
}

/** How long to stop using a model after a failure (capped at one hour). */
export function cooldownFor(
  kind: FailureKind,
  message: string,
  retryAfterHeaderSec?: number | null,
): number {
  if (kind === "no_credit") return HOUR;
  if (kind === "rate_limit") {
    if (/per[- ]day|daily/i.test(message)) return HOUR; // a daily quota will not clear in minutes
    const fromMessage = parseTryAgainMs(message);
    const fromHeader = retryAfterHeaderSec ? retryAfterHeaderSec * 1000 : null;
    return Math.min(HOUR, Math.max(15_000, fromMessage ?? fromHeader ?? 60_000));
  }
  return 60_000; // transient/unknown errors: brief breather
}

/** A short human-readable reason for one provider, e.g. "daily free limit reached". */
export function describeFailure(kind: FailureKind, message: string, cooldownMs: number): string {
  if (kind === "no_credit") return "no credits";
  if (kind === "rate_limit") {
    if (/per[- ]day|daily/i.test(message)) return "daily free limit reached";
    const mins = Math.max(1, Math.round(cooldownMs / 60_000));
    return `rate-limited, retry in about ${mins} min`;
  }
  return "error";
}
