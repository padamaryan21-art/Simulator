import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { groups, scheduledRuns, schedules } from "@/db/schema";
import type { ScheduleUpdate } from "@/validators/schedules";
import {
  activeInstance,
  quotaForShift,
  upcomingInstances,
  type ShiftInstance,
} from "@/lib/scheduling/duty";
import {
  accountSentInShift,
  connectedParticipants,
  dutyOf,
  ensurePlans,
  sentInShift,
} from "./planner";

type Schedule = typeof schedules.$inferSelect;

export class ScheduleError extends Error {}

/** Every private-simulation group gets exactly one schedule row, created disabled on first use. */
async function ensureScheduleRows() {
  const priv = await db.select().from(groups).where(eq(groups.type, "PRIVATE_SIMULATION"));
  const existing = await db.select({ groupId: schedules.groupId }).from(schedules);
  const have = new Set(existing.map((e) => e.groupId));
  const missing = priv.filter((g) => !have.has(g.id));
  if (missing.length) {
    await db.insert(schedules).values(missing.map((g) => ({ groupId: g.id, enabled: false })));
  }
  return priv;
}

const shiftView = (i: ShiftInstance | null | undefined) =>
  i ? { date: i.date, type: i.type, start: i.start.toISOString(), end: i.end.toISOString() } : null;

export async function listScheduleViews(now = new Date()) {
  const privateGroups = await ensureScheduleRows();
  const rows = await db.select().from(schedules).orderBy(asc(schedules.createdAt));

  return Promise.all(
    rows
      .filter((s) => privateGroups.some((g) => g.id === s.groupId))
      .map(async (schedule) => {
        const group = privateGroups.find((g) => g.id === schedule.groupId)!;
        const duty = dutyOf(schedule);
        const accounts = await connectedParticipants(group.id);
        const active = activeInstance(duty, now);
        const next = upcomingInstances(duty, now, 24 * 8).find(
          (i) => i.start.getTime() > now.getTime(),
        );
        const focus = active ?? next ?? null;

        let progress: null | {
          shift: ReturnType<typeof shiftView>;
          quotaPerAccount: number;
          target: number;
          sent: number;
          perAccount: { name: string; sent: number; quota: number }[];
        } = null;
        let runs: {
          id: string;
          runAt: string;
          plannedMessages: number;
          status: string;
          error: string | null;
        }[] = [];

        if (focus) {
          const quota = quotaForShift(schedule.messagesPerAccountPerDay, focus);
          const [sent, per, runRows] = await Promise.all([
            sentInShift(group.id, focus),
            Promise.all(
              accounts.map(async (a) => ({
                name: a.name,
                sent: await accountSentInShift(a.accountId, focus),
                quota,
              })),
            ),
            db
              .select()
              .from(scheduledRuns)
              .where(
                and(
                  eq(scheduledRuns.scheduleId, schedule.id),
                  eq(scheduledRuns.runDate, focus.date),
                ),
              )
              .orderBy(asc(scheduledRuns.runAt)),
          ]);
          progress = {
            shift: shiftView(focus),
            quotaPerAccount: quota,
            target: quota * accounts.length,
            sent,
            perAccount: per,
          };
          runs = runRows.map((r) => ({
            id: r.id,
            runAt: r.runAt.toISOString(),
            plannedMessages: r.plannedMessages,
            status: r.status,
            error: r.error,
          }));
        }

        return {
          schedule: {
            id: schedule.id,
            groupId: group.id,
            groupName: group.name,
            groupAutomationEnabled: group.automationEnabled,
            enabled: schedule.enabled,
            timezone: schedule.timezone,
            messagesPerAccountPerDay: schedule.messagesPerAccountPerDay,
            messagesPerSessionMin: schedule.messagesPerSessionMin,
            messagesPerSessionMax: schedule.messagesPerSessionMax,
            minGapPerAccountSec: schedule.minGapPerAccountSec,
            weeklyPattern: schedule.weeklyPattern,
            dateOverrides: schedule.dateOverrides,
          },
          connectedAccounts: accounts.map((a) => a.name),
          onDuty: Boolean(active),
          currentShift: shiftView(active),
          nextShift: shiftView(next),
          progress,
          runs,
        };
      }),
  );
}

export type ScheduleView = Awaited<ReturnType<typeof listScheduleViews>>[number];

export async function updateSchedule(id: string, patch: ScheduleUpdate) {
  const [current] = await db.select().from(schedules).where(eq(schedules.id, id));
  if (!current) throw new ScheduleError("Schedule not found");

  const min = patch.messagesPerSessionMin ?? current.messagesPerSessionMin;
  const max = patch.messagesPerSessionMax ?? current.messagesPerSessionMax;
  if (min > max) throw new ScheduleError("Max messages per conversation must be at least the min");

  if (patch.enabled) {
    const [group] = await db.select().from(groups).where(eq(groups.id, current.groupId));
    if (group.type !== "PRIVATE_SIMULATION") {
      throw new ScheduleError("Only private simulation groups can be scheduled.");
    }
    if (!group.automationEnabled) {
      throw new ScheduleError("Turn on Automation for this group on the Groups page first.");
    }
  }

  const [row] = Object.keys(patch).length
    ? await db.update(schedules).set(patch).where(eq(schedules.id, id)).returning()
    : [current];
  // A changed shift calendar or quota should take effect now, not at the next tick.
  if (row.enabled) await ensurePlans().catch(() => undefined);
  return row;
}

/** Recent runs across all schedules, newest first (for the Queue page). */
export async function recentRuns(hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000);
  return db
    .select()
    .from(scheduledRuns)
    .where(gte(scheduledRuns.runAt, since))
    .orderBy(desc(scheduledRuns.runAt))
    .limit(200);
}

export type { Schedule };
