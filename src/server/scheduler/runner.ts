import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversationMessages,
  conversationSessions,
  groups,
  scheduledRuns,
  schedules,
} from "@/db/schema";
import { childLogger } from "@/lib/logger";
import { createConversation, startSend } from "@/server/conversations/service";
import { writeLog } from "@/server/conversations/logs";
import { getAutomationState } from "./control";
import { isOnDuty } from "@/lib/scheduling/duty";
import { realCommunityConflict } from "@/server/groups/safety";
import { connectedParticipants, dutyOf, setRunStatus } from "./planner";

const log = childLogger("scheduler.runner");

const shuffle = <T>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

/**
 * Takes the oldest unused draft conversation (made earlier by a bulk run) and turns it into an
 * automatic one. FOR UPDATE SKIP LOCKED makes concurrent runs claim different drafts.
 */
/** Exported for tests. */
export async function claimDraft(groupId: string, scheduleId: string): Promise<string | null> {
  const res = await db.execute<{ id: string }>(sql`
    update conversation_sessions
    set mode = 'AUTOMATIC', status = 'PENDING_APPROVAL', schedule_id = ${scheduleId}
    where id = (
      select id from conversation_sessions
      where group_id = ${groupId} and status = 'DRAFT' and mode = 'PREVIEW'
        and environment = 'PRIVATE_SIMULATION'
        -- only drafts that can really be sent right now: every speaker is an active persona
        -- whose Telegram account is connected
        and not exists (
          select 1 from conversation_messages m
          left join personas p on p.id = m.persona_id
          left join telegram_accounts a on a.id = p.telegram_account_id
          where m.session_id = conversation_sessions.id
            and (p.id is null or p.active = false or a.id is null or a.status <> 'CONNECTED')
        )
      order by created_at
      limit 1
      for update skip locked
    )
    returning id`);
  const id = (res as unknown as { id: string }[])[0]?.id;
  if (!id) return null;
  // Drafts are never human-reviewed here; automation is allowed only in the private group.
  await db
    .update(conversationMessages)
    .set({ status: "APPROVED", approvedAt: new Date() })
    .where(
      and(
        eq(conversationMessages.sessionId, id),
        inArray(conversationMessages.status, ["GENERATED", "EDITED"]),
      ),
    );
  return id;
}

/**
 * Executes one planned run: re-validates every precondition at run time, picks or generates a
 * conversation, and hands it to the sender queue. Never throws; failures are recorded on the run.
 */
export async function executeRun(runId: string) {
  const [run] = await db.select().from(scheduledRuns).where(eq(scheduledRuns.id, runId));
  if (!run || run.status !== "QUEUED") return { ok: false as const, reason: "not queued" };

  const state = await getAutomationState();
  if (state === "STOPPED") {
    await setRunStatus(run.id, "CANCELLED", { error: "Automation stopped" });
    return { ok: false as const, reason: "stopped" };
  }
  if (state === "PAUSED") {
    // Put it back; the next tick re-dispatches it after RESUME.
    await setRunStatus(run.id, "PENDING");
    return { ok: false as const, reason: "paused" };
  }

  const [schedule] = await db.select().from(schedules).where(eq(schedules.id, run.scheduleId));
  const [group] = schedule
    ? await db.select().from(groups).where(eq(groups.id, schedule.groupId))
    : [];
  const skip = async (error: string) => {
    await setRunStatus(run.id, "SKIPPED", { error });
    return { ok: false as const, reason: error };
  };
  if (!schedule?.enabled) return skip("Schedule disabled");
  if (!group || group.type !== "PRIVATE_SIMULATION" || !group.active || !group.automationEnabled) {
    return skip("Group is not an automation-enabled private simulation");
  }
  if (await realCommunityConflict(group)) return skip("Group points at the real community chat");
  if (!isOnDuty(dutyOf(schedule), new Date())) return skip("Off duty");

  await setRunStatus(run.id, "RUNNING");
  let draftId: string | null = null;
  let startedSessionId: string | null = null;
  try {
    const members = await connectedParticipants(group.id);
    if (members.length < 2) throw new Error("Fewer than two connected accounts");

    draftId = await claimDraft(group.id, schedule.id);
    let sessionId = draftId;
    if (!sessionId) {
      const n = 2 + Math.floor(Math.random() * (members.length - 1));
      const picked = shuffle(members).slice(0, n);
      const res = await createConversation(
        {
          groupId: group.id,
          participantIds: picked.map((m) => m.personaId),
          topicId: null,
          mode: "AUTOMATIC",
          messageCount: Math.min(40, Math.max(4, run.plannedMessages)),
        },
        null,
        { scheduleId: schedule.id, startSending: false },
      );
      sessionId = res.sessionId;
    }
    startedSessionId = sessionId;
    await setRunStatus(run.id, "RUNNING", { sessionId });
    await startSend(sessionId, null);
    log.info({ runId, sessionId, fromDraft: Boolean(draftId) }, "run started");
    return { ok: true as const, sessionId };
  } catch (err) {
    const message = (err as Error).message;
    // Never destroy content because a send could not start. A claimed draft goes back to being an
    // untouched draft; only a conversation generated for this very run (no one asked for it
    // otherwise) is cancelled so it is not left half-approved.
    if (draftId) {
      await db
        .update(conversationMessages)
        .set({ status: "GENERATED", approvedAt: null })
        .where(
          and(
            eq(conversationMessages.sessionId, draftId),
            eq(conversationMessages.status, "APPROVED"),
            isNull(conversationMessages.approvedBy),
          ),
        );
      await db
        .update(conversationSessions)
        .set({ mode: "PREVIEW", status: "DRAFT", scheduleId: null })
        .where(
          and(
            eq(conversationSessions.id, draftId),
            inArray(conversationSessions.status, ["DRAFT", "PENDING_APPROVAL"]),
          ),
        );
    } else if (startedSessionId) {
      await db
        .update(conversationSessions)
        .set({ status: "CANCELLED", endedAt: new Date() })
        .where(
          and(
            eq(conversationSessions.id, startedSessionId),
            inArray(conversationSessions.status, ["DRAFT", "PENDING_APPROVAL"]),
          ),
        );
    }
    await setRunStatus(run.id, "FAILED", { error: message.slice(0, 500) });
    await writeLog("error", "scheduler", `Run failed: ${message}`.slice(0, 300), { runId });
    return { ok: false as const, reason: message };
  }
}
