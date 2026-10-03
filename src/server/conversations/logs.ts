import { db } from "@/db";
import { automationLogs } from "@/db/schema";
import { logger } from "@/lib/logger";

/** Persists an event for the Logs page. `meta` must never contain secrets or message bodies. */
export async function writeLog(
  level: "debug" | "info" | "warn" | "error",
  category: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  try {
    const { actorId, ...rest } = (meta ?? {}) as Record<string, unknown> & { actorId?: string };
    await db.insert(automationLogs).values({
      level,
      category,
      message,
      meta: Object.keys(rest).length ? rest : null,
      actorId: actorId ?? null,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "failed to persist log");
  }
}
