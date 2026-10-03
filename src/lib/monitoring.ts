import { logger } from "./logger";

/**
 * Error-monitoring hook, ready for Sentry without requiring it.
 *
 * If SENTRY_DSN is set AND `@sentry/node` is installed (`npm i @sentry/node`), errors are sent
 * there; otherwise they are only logged. Nothing sensitive is attached: only the error, a short
 * context label and ids. Conversation text, Telegram sessions and credentials never go here.
 */
type SentryLike = {
  init(opts: Record<string, unknown>): void;
  captureException(err: unknown, hint?: Record<string, unknown>): void;
};

let sentry: SentryLike | null | undefined;

async function getSentry(): Promise<SentryLike | null> {
  if (sentry !== undefined) return sentry;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return (sentry = null);
  try {
    // Indirect import so bundlers do not try to resolve an optional dependency.
    const load = new Function("m", "return import(m)") as (m: string) => Promise<SentryLike>;
    const mod = await load("@sentry/node");
    mod.init({
      dsn,
      sendDefaultPii: false,
      // Drop request bodies/cookies/headers entirely.
      beforeSend(event: Record<string, unknown>) {
        delete event.request;
        delete event.user;
        return event;
      },
    });
    return (sentry = mod);
  } catch {
    logger.warn("SENTRY_DSN is set but @sentry/node is not installed; errors are only logged");
    return (sentry = null);
  }
}

export async function captureError(
  err: unknown,
  context: string,
  extra?: Record<string, string | number>,
) {
  logger.error(
    { context, err: err instanceof Error ? err.message : String(err), ...extra },
    "captured error",
  );
  const s = await getSentry();
  s?.captureException(err, { tags: { context }, extra });
}
