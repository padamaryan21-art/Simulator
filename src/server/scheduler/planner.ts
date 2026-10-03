import { and, count, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversationMessages,
  conversationSessions,
  groupParticipants,
  groups,
  personas,
  scheduledRuns,
  schedules,
  telegramAccounts,
} from "@/db/schema";
import { childLogger } from "@/lib/logger";
import {
  parseDutyConfig,
  quotaForShift,
  upcomingInstances,
  type ShiftInstance,
} from "@/lib/scheduling/duty";
import { planRuns } from "@/lib/scheduling/plan";
import { realCommunityConflict } from "@/server/groups/safety";

const log = childLogger("scheduler.planner");

export type ScheduleRow = typeof schedules.$inferSelect;

export const dutyOf = (s: ScheduleRow) =>
  parseDutyConfig(s.timezone, s.weeklyPattern, s.dateOverrides);

/** Participants of a group whose Telegram account is connected: the accounts that can send. */
export async function connectedParticipants(groupId: string) {
  return db
    .select({
      personaId: personas.id,
      name: personas.name,
      accountId: telegramAccounts.id,
    })
    .from(groupParticipants)
    .innerJoin(personas, eq(groupParticipants.personaId, personas.id))
    .innerJoin(telegramAccounts, eq(personas.telegramAccountId, telegramAccounts.id))
    .where(
      and(
        eq(groupParticipants.groupId, groupId),
        eq(personas.active, true),
        eq(telegramAccounts.status, "CONNECTED"),
        eq(telegramAccounts.active, true),
      ),
    );
}

/** Messages sent in a group during a shift (all accounts). */
export async function sentInShift(groupId: string, shift: ShiftInstance) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(conversationMessages)
    .innerJoin(conversationSessions, eq(conversationMessages.sessionId, conversationSessions.id))
    .where(
      and(
        eq(conversationSessions.groupId, groupId),
        eq(conversationMessages.status, "SENT"),
        gte(conversationMessages.sentAt, shift.start),
        lt(conversationMessages.sentAt, shift.end),
      ),
    );
  return n;
}

/** Messages one Telegram account has sent during a shift (for the per-account quota). */
export async function accountSentInShift(accountId: string, shift: ShiftInstance) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.telegramAccountId, accountId),
        eq(conversationMessages.status, "SENT"),
        gte(conversationMessages.sentAt, shift.start),
        lt(conversationMessages.sentAt, shift.end),
      ),
    );
  return n;
}

/**
 * Tops up the plan for every enabled private-group schedule. Idempotent: it only creates runs
 * for the messages that are still missing (quota - already sent - already planned), so it is
 * safe to call every few minutes and after START/RESUME.
 */
export async function ensurePlans(now = new Date(), only?: { scheduleId: string }) {
  const rows = await db
    .select({ schedule: schedules, group: groups })
    .from(schedules)
    .innerJoin(groups, eq(schedules.groupId, groups.id))
    .where(
      only
        ? and(eq(schedules.enabled, true), eq(schedules.id, only.scheduleId))
        : eq(schedules.enabled, true),
    );

  let created = 0;
  for (const { schedule, group } of rows) {
    // Hard rules: only active private-simulation groups with automation switched on.
    if (group.type !== "PRIVATE_SIMULATION" || !group.active || !group.automationEnabled) continue;
    if (await realCommunityConflict(group)) {
      log.warn({ groupId: group.id }, "group points at the real community chat; not planning");
      continue;
    }

    const accounts = await connectedParticipants(group.id);
    if (accounts.length < 2) {
      log.info(
        { groupId: group.id, connected: accounts.length },
        "not enough connected accounts to plan",
      );
      continue;
    }

    for (const shift of upcomingInstances(dutyOf(schedule), now)) {
      const target = quotaForShift(schedule.messagesPerAccountPerDay, shift) * accounts.length;
      const [sent, runs] = await Promise.all([
        sentInShift(group.id, shift),
        db
          .select()
          .from(scheduledRuns)
          .where(
            and(eq(scheduledRuns.scheduleId, schedule.id), eq(scheduledRuns.runDate, shift.date)),
          ),
      ]);
      const inFlight = runs
        .filter((r) => ["PENDING", "QUEUED", "RUNNING"].includes(r.status))
        .reduce((n, r) => n + r.plannedMessages, 0);
      const needed = target - sent - inFlight;

      // Failsafe against a failure loop endlessly re-planning the same shift.
      const maxRuns = Math.ceil(target / schedule.messagesPerSessionMin) * 2;
      if (runs.length >= maxRuns) continue;

      const planned = planRuns({
        now,
        shift,
        neededMessages: needed,
        minSize: schedule.messagesPerSessionMin,
        maxSize: schedule.messagesPerSessionMax,
      });
      if (!planned.length) continue;
      await db.insert(scheduledRuns).values(
        planned.map((p) => ({
          scheduleId: schedule.id,
          runDate: shift.date,
          runAt: p.runAt,
          plannedMessages: p.size,
        })),
      );
      created += planned.length;
      log.info(
        { scheduleId: schedule.id, date: shift.date, runs: planned.length, needed },
        "plan topped up",
      );
    }
  }
  return { created };
}

/** Marks due PENDING runs as QUEUED and returns their ids for the caller to enqueue. */
export async function claimDueRuns(now = new Date(), limit = 50): Promise<string[]> {
  const due = await db
    .update(scheduledRuns)
    .set({ status: "QUEUED" })
    .where(
      inArray(
        scheduledRuns.id,
        db
          .select({ id: scheduledRuns.id })
          .from(scheduledRuns)
          .where(and(eq(scheduledRuns.status, "PENDING"), lte(scheduledRuns.runAt, now)))
          .limit(limit),
      ),
    )
    .returning({ id: scheduledRuns.id });
  return due.map((r) => r.id);
}

export async function setRunStatus(
  id: string,
  status: (typeof scheduledRuns.$inferSelect)["status"],
  extra: { sessionId?: string; error?: string | null } = {},
) {
  await db
    .update(scheduledRuns)
    .set({ status, ...extra })
    .where(eq(scheduledRuns.id, id));
}

/** Runs stuck in QUEUED (job lost, e.g. Redis was reset) go back to PENDING to be re-dispatched. */
export async function requeueStaleRuns(now = new Date(), staleMinutes = 15) {
  const cutoff = new Date(now.getTime() - staleMinutes * 60_000);
  const res = await db
    .update(scheduledRuns)
    .set({ status: "PENDING" })
    .where(and(eq(scheduledRuns.status, "QUEUED"), lt(scheduledRuns.updatedAt, cutoff)))
    .returning({ id: scheduledRuns.id });
  return res.length;
}

/** Closes RUNNING runs whose conversation has already finished. */
export async function syncFinishedRuns() {
  await db.execute(sql`
    update scheduled_runs r
    set status = case s.status
        when 'COMPLETED' then 'DONE'
        when 'FAILED' then 'FAILED'
        else 'CANCELLED' end,
      updated_at = now()
    from conversation_sessions s
    where r.status = 'RUNNING' and r.session_id = s.id
      and s.status in ('COMPLETED', 'FAILED', 'CANCELLED')`);
}

/** STOP ALL: nothing planned may start afterwards. */
export async function cancelPendingRuns() {
  const res = await db
    .update(scheduledRuns)
    .set({ status: "CANCELLED", error: "Stopped" })
    .where(inArray(scheduledRuns.status, ["PENDING", "QUEUED"]))
    .returning({ id: scheduledRuns.id });
  return res.length;
}
