import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { automationState, conversationMessages, conversationSessions } from "@/db/schema";
import { childLogger } from "@/lib/logger";
import { writeLog } from "@/server/conversations/logs";
import { cancelPendingRuns, ensurePlans } from "./planner";

const log = childLogger("automation");

export type AutomationState = "STOPPED" | "RUNNING" | "PAUSED";
export type ControlAction = "start" | "pause" | "resume" | "stop";

export async function getAutomationState(): Promise<AutomationState> {
  const [row] = await db.select().from(automationState).where(eq(automationState.id, 1));
  return row?.state ?? "STOPPED";
}

async function setState(state: AutomationState, userId?: string) {
  await db
    .insert(automationState)
    .values({ id: 1, state, updatedBy: userId })
    .onConflictDoUpdate({ target: automationState.id, set: { state, updatedBy: userId } });
}

/** Cancels every in-flight or queued automated send. Used by STOP ALL. */
async function cancelAutomatedSends() {
  const sessions = await db
    .select({ id: conversationSessions.id })
    .from(conversationSessions)
    .where(
      and(
        eq(conversationSessions.mode, "AUTOMATIC"),
        inArray(conversationSessions.status, ["SENDING", "PENDING_APPROVAL"]),
      ),
    );
  if (!sessions.length) return 0;
  const ids = sessions.map((s) => s.id);
  await db
    .update(conversationMessages)
    .set({ status: "CANCELLED" })
    .where(
      and(
        inArray(conversationMessages.sessionId, ids),
        inArray(conversationMessages.status, ["APPROVED", "SCHEDULED"]),
      ),
    );
  await db
    .update(conversationSessions)
    .set({ status: "CANCELLED", endedAt: new Date() })
    .where(inArray(conversationSessions.id, ids));
  return ids.length;
}

export async function applyControl(action: ControlAction, userId?: string) {
  const current = await getAutomationState();
  let next: AutomationState;
  switch (action) {
    case "start":
      next = "RUNNING";
      break;
    case "pause":
      next = "PAUSED";
      break;
    case "resume":
      // Resume only makes sense from PAUSED; otherwise it must be an explicit START.
      next = current === "PAUSED" ? "RUNNING" : current;
      break;
    case "stop":
      next = "STOPPED";
      break;
  }
  await setState(next, userId);
  let cancelled = 0;
  if (action === "stop") {
    // STOP ALL: end in-flight automated sends AND drop everything planned but not yet started.
    cancelled = await cancelAutomatedSends();
    await cancelPendingRuns();
  } else if (next === "RUNNING" && current !== "RUNNING") {
    // START / RESUME: top up today's plan right away instead of waiting for the next tick.
    await ensurePlans().catch((err) => log.warn({ err: (err as Error).message }, "plan failed"));
  }
  log.info({ action, from: current, to: next, cancelled }, "automation control");
  await writeLog("warn", "automation", `${action.toUpperCase()} ALL: ${current} -> ${next}`, {
    cancelledSessions: cancelled,
    ...(userId ? { actorId: userId } : {}),
  });
  return { state: next, cancelledSessions: cancelled };
}
