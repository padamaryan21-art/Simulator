import { and, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationSessions } from "@/db/schema";
import { childLogger } from "@/lib/logger";
import { writeLog } from "@/server/conversations/logs";

const log = childLogger("maintenance.cleanup");

const FINISHED = ["COMPLETED", "FAILED", "CANCELLED"] as const;
const BATCH = 200;
const EVERY_MS = 60 * 60_000;

const g = globalThis as unknown as { __lastCleanupAt?: number };

/** Days to keep finished conversations. 0 turns the cleanup off. */
export function retentionDays() {
  const n = Number(process.env.SENT_RETENTION_DAYS ?? 2);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

/**
 * Deletes finished conversations (and, by cascade, all their messages) older than `days`.
 * Drafts and sessions that are still sending are never touched. Quotas only look at the current
 * shift and images carry their own "used" flag, so older rows are not needed for those.
 */
export async function purgeFinishedSessions(days: number) {
  if (days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  let total = 0;
  for (;;) {
    const rows = await db
      .select({ id: conversationSessions.id })
      .from(conversationSessions)
      .where(
        and(
          inArray(conversationSessions.status, [...FINISHED]),
          sql`coalesce(${conversationSessions.endedAt}, ${conversationSessions.createdAt}) < ${cutoff}::timestamptz`,
        ),
      )
      .limit(BATCH);
    if (!rows.length) break;
    await db.delete(conversationSessions).where(
      inArray(
        conversationSessions.id,
        rows.map((r) => r.id),
      ),
    );
    total += rows.length;
    if (rows.length < BATCH) break;
  }
  return total;
}

/** Called from the scheduler tick; runs at most once an hour and never throws. */
export async function runCleanupIfDue() {
  const now = Date.now();
  if (g.__lastCleanupAt && now - g.__lastCleanupAt < EVERY_MS) return 0;
  g.__lastCleanupAt = now;
  const days = retentionDays();
  if (days <= 0) return 0;
  try {
    const removed = await purgeFinishedSessions(days);
    if (removed > 0) {
      log.info({ removed, days }, "old conversations removed");
      await writeLog(
        "info",
        "cleanup",
        `Removed ${removed} finished conversation(s) older than ${days} day(s)`,
      );
    }
    return removed;
  } catch (err) {
    log.warn({ err: (err as Error).message }, "cleanup failed; will retry next hour");
    return 0;
  }
}
