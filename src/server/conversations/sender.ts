import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  conversationMessages,
  conversationSessions,
  groups,
  scheduledRuns,
  schedules,
} from "@/db/schema";
import { childLogger } from "@/lib/logger";
import { extractMemoriesForSession } from "@/server/memory/extract";
import { enqueueMemory } from "@/server/queues/conversationQueue";
import { waitForAccountSlot } from "@/server/queues/locks";
import { redisConfigured } from "@/server/queues/names";
import { isWorkerAlive } from "@/server/queues/workerStatus";
import { activeInstance, quotaForShift } from "@/lib/scheduling/duty";
import { getAutomationState } from "@/server/scheduler/control";
import { accountSentInShift, dutyOf } from "@/server/scheduler/planner";
import { getSetting } from "@/server/settings/settings";
import { TelegramServiceError } from "@/server/telegram/errors";
import { sendImage, sendMessage } from "@/server/telegram/messages";
import { FALLBACK_CAPTION } from "@/server/images/pick";
import { loadImageForSend, markImageUsed } from "@/server/images/service";
import { isDryRun } from "@/lib/env";
import { writeLog } from "./logs";
import { assertMessageSendable, pickDelaySeconds, RuleError } from "./rules";

const log = childLogger("conversation.sender");

/** Guards against two senders for the same session in this process. */
const g = globalThis as unknown as { __activeSenders?: Set<string> };
const active = (g.__activeSenders ??= new Set());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isCancelled(sessionId: string) {
  const [s] = await db
    .select({ status: conversationSessions.status })
    .from(conversationSessions)
    .where(eq(conversationSessions.id, sessionId));
  return !s || s.status !== "SENDING";
}

/** Waits `seconds`, waking every 2s to honour cancel / STOP ALL. Returns false if cancelled. */
async function interruptibleWait(sessionId: string, seconds: number) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    await sleep(Math.min(2000, end - Date.now()));
    if (await isCancelled(sessionId)) return false;
  }
  return true;
}

/** PAUSE ALL holds automated sends in place; STOP ALL (or cancel) ends them. */
async function waitWhilePaused(sessionId: string): Promise<"ok" | "stop"> {
  for (;;) {
    const state = await getAutomationState();
    if (state === "RUNNING") return "ok";
    if (state === "STOPPED" || (await isCancelled(sessionId))) return "stop";
    await sleep(5000);
  }
}

async function finish(sessionId: string, status: "COMPLETED" | "FAILED" | "CANCELLED") {
  const done = await db
    .update(conversationSessions)
    .set({ status, endedAt: new Date() })
    .where(and(eq(conversationSessions.id, sessionId), eq(conversationSessions.status, "SENDING")))
    .returning({ id: conversationSessions.id });
  if (done.length) {
    await db
      .update(scheduledRuns)
      .set({ status: status === "COMPLETED" ? "DONE" : status })
      .where(eq(scheduledRuns.sessionId, sessionId));
  }
}

async function cancelRemaining(sessionId: string, reason: string) {
  await db
    .update(conversationMessages)
    .set({ status: "CANCELLED", errorMessage: reason })
    .where(
      and(
        eq(conversationMessages.sessionId, sessionId),
        eq(conversationMessages.status, "APPROVED"),
      ),
    );
}

/**
 * Sends the approved messages of a session one by one with human-like delays. Runs inside the
 * BullMQ worker (or in-process when no worker is online). Before EVERY message it re-checks:
 * cancellation, the approval rules, automation state (pause waits, stop ends), the duty calendar,
 * the account's daily quota, and the per-account minimum gap.
 */
export async function runSender(sessionId: string, userId: string | null) {
  if (active.has(sessionId)) return;
  active.add(sessionId);
  let sent = 0;
  try {
    const [session] = await db
      .select()
      .from(conversationSessions)
      .where(eq(conversationSessions.id, sessionId));
    const [group] = await db.select().from(groups).where(eq(groups.id, session.groupId));
    const settings = await getSetting("sending");
    const schedule = session.scheduleId
      ? (await db.select().from(schedules).where(eq(schedules.id, session.scheduleId)))[0]
      : undefined;
    const duty = schedule ? dutyOf(schedule) : null;
    const automated = session.mode === "AUTOMATIC";

    const queue = await db
      .select()
      .from(conversationMessages)
      .where(
        and(
          eq(conversationMessages.sessionId, sessionId),
          eq(conversationMessages.status, "APPROVED"),
        ),
      )
      .orderBy(asc(conversationMessages.position));

    for (let i = 0; i < queue.length; i++) {
      if (await isCancelled(sessionId)) {
        await writeLog("warn", "send", "Sending stopped", { sessionId, sent });
        return;
      }
      // Re-read: the message may have been edited/skipped/cancelled since we queued it.
      const [msg] = await db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.id, queue[i].id));
      if (!msg || msg.status !== "APPROVED") continue;

      if (automated && (await waitWhilePaused(sessionId)) === "stop") {
        await writeLog("warn", "send", "Automation stopped; session ended", { sessionId, sent });
        return;
      }

      assertMessageSendable(msg, {
        environment: session.environment,
        mode: session.mode,
        automation: await getAutomationState(),
      });

      // Duty calendar: automated scheduled sessions only run while the operator is on duty.
      const shift = duty ? activeInstance(duty, new Date()) : null;
      if (duty && automated && !shift) {
        await cancelRemaining(sessionId, "Off duty");
        await writeLog("info", "send", "Off duty; remaining messages cancelled", {
          sessionId,
          sent,
        });
        await finish(sessionId, sent > 0 ? "COMPLETED" : "CANCELLED");
        return;
      }

      // Per-account daily quota.
      if (schedule && shift && automated && msg.telegramAccountId) {
        const quota = quotaForShift(schedule.messagesPerAccountPerDay, shift);
        if ((await accountSentInShift(msg.telegramAccountId, shift)) >= quota) {
          await db
            .update(conversationMessages)
            .set({ status: "CANCELLED", errorMessage: "Daily quota reached" })
            .where(eq(conversationMessages.id, msg.id));
          continue;
        }
      }

      if (sent > 0) {
        const delay = pickDelaySeconds(settings, msg.content.length);
        if (!(await interruptibleWait(sessionId, delay))) {
          await writeLog("warn", "send", "Sending stopped", { sessionId, sent });
          return;
        }
      }

      // Minimum gap between messages from the same account, across all sessions and processes.
      if (schedule && msg.telegramAccountId && redisConfigured()) {
        const proceed = await waitForAccountSlot(
          msg.telegramAccountId,
          schedule.minGapPerAccountSec * 1000,
          () => isCancelled(sessionId),
        );
        if (!proceed) return;
      }

      // PAUSE ALL may have been pressed during the waits above; check again right before sending.
      if (automated && (await waitWhilePaused(sessionId)) === "stop") {
        await writeLog("warn", "send", "Automation stopped; session ended", { sessionId, sent });
        return;
      }

      let attempt = 0;
      for (;;) {
        try {
          const target = { url: group.url, telegramChatId: group.telegramChatId };
          if (msg.imageId) {
            // A picture message: load the file, send it as a photo, then retire the picture for good.
            const loaded = await loadImageForSend(msg.imageId);
            if (!loaded || !loaded.image.enabled) {
              await db
                .update(conversationMessages)
                .set({ status: "CANCELLED", errorMessage: "Image unavailable" })
                .where(eq(conversationMessages.id, msg.id));
              break;
            }
            await sendImage(msg.telegramAccountId!, target, {
              data: loaded.data,
              filename: "photo.jpg",
              caption: msg.content.trim() === FALLBACK_CAPTION ? "" : msg.content,
            });
            // A dry run must not use up the library; only a real post makes an image unusable.
            if (!isDryRun()) await markImageUsed(msg.imageId);
          } else {
            await sendMessage(msg.telegramAccountId!, target, msg.content);
          }
          // The message is already out. A pooled connection may have gone stale during the waits,
          // so retry the bookkeeping write rather than failing a message that was delivered.
          await markSent(msg.id);
          sent++;
          break;
        } catch (err) {
          const e =
            err instanceof TelegramServiceError
              ? err
              : new TelegramServiceError((err as Error).message, "UNKNOWN");
          // FloodWait: wait what Telegram asks (once), then retry.
          if (e.code === "FLOOD_WAIT" && attempt === 0 && (e.retryAfterSeconds ?? 0) <= 300) {
            attempt++;
            await writeLog("warn", "send", `FloodWait: waiting ${e.retryAfterSeconds}s`, {
              sessionId,
            });
            if (!(await interruptibleWait(sessionId, (e.retryAfterSeconds ?? 30) + 1))) return;
            continue;
          }
          await db
            .update(conversationMessages)
            .set({ status: "FAILED", errorMessage: e.message })
            .where(eq(conversationMessages.id, msg.id));
          await writeLog("error", "send", "Message failed; stopping session", {
            sessionId,
            code: e.code,
          });
          await finish(sessionId, "FAILED");
          return;
        }
      }
    }

    await finish(sessionId, "COMPLETED");
    await writeLog("info", "send", "Sending completed", {
      sessionId,
      sent,
      ...(userId ? { actorId: userId } : {}),
    });
    if (group.type === "PRIVATE_SIMULATION") await scheduleMemoryExtraction(sessionId, group.id);
  } catch (err) {
    log.error({ sessionId, err: (err as Error).message }, "sender crashed");
    await writeLog(
      "error",
      "send",
      err instanceof RuleError ? `Blocked: ${err.message}` : "Sender error",
      { sessionId },
    );
    await finish(sessionId, "FAILED");
  } finally {
    active.delete(sessionId);
  }
}

async function markSent(messageId: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await db
        .update(conversationMessages)
        .set({ status: "SENT", sentAt: new Date(), errorMessage: null })
        .where(eq(conversationMessages.id, messageId));
      return;
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

/** Memory extraction goes through the queue when a worker is online, otherwise runs inline. */
async function scheduleMemoryExtraction(sessionId: string, groupId: string) {
  if (redisConfigured() && (await isWorkerAlive())) {
    await enqueueMemory(sessionId, groupId).catch(() => undefined);
  } else {
    void extractMemoriesForSession(sessionId, groupId);
  }
}
