import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { groups } from "./groups";

export const schedules = pgTable("schedules", {
  id: id(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  conversationsPerDayMin: integer("conversations_per_day_min").notNull().default(2),
  conversationsPerDayMax: integer("conversations_per_day_max").notNull().default(4),
  messagesPerSessionMin: integer("messages_per_session_min").notNull().default(10),
  messagesPerSessionMax: integer("messages_per_session_max").notNull().default(30),
  /** Minutes from midnight, in `timezone`. */
  windowStartMinute: integer("window_start_minute").notNull().default(600),
  windowEndMinute: integer("window_end_minute").notNull().default(1320),
  quietStartMinute: integer("quiet_start_minute").notNull().default(1380),
  quietEndMinute: integer("quiet_end_minute").notNull().default(480),
  timezone: text("timezone").notNull().default("Asia/Manila"),
  /** Daily quota per connected participant account. Total plan = accounts x this. */
  messagesPerAccountPerDay: integer("messages_per_account_per_day").notNull().default(400),
  /**
   * Duty calendar. Generation and sending only happen while the operator is on duty.
   * weeklyPattern: { "0".."6": { type, startMinute?, endMinute? } } (0 = Sunday).
   * dateOverrides: { "YYYY-MM-DD": { type, startMinute?, endMinute? } }.
   * Empty = no duty = nothing runs. (The older window/quiet columns are no longer used.)
   */
  weeklyPattern: jsonb("weekly_pattern").notNull().default({}),
  dateOverrides: jsonb("date_overrides").notNull().default({}),
  /** Minimum seconds between two messages sent from the same Telegram account. */
  minGapPerAccountSec: integer("min_gap_per_account_sec").notNull().default(20),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

/** Single-row global switch: START/PAUSE/RESUME/STOP ALL. */
export const automationState = pgTable("automation_state", {
  id: integer("id").primaryKey().default(1),
  state: text("state", { enum: ["STOPPED", "RUNNING", "PAUSED"] })
    .notNull()
    .default("STOPPED"),
  updatedAt: updatedAt(),
  updatedBy: uuid("updated_by"),
}).enableRLS();

/**
 * The scheduler's durable plan: one row per conversation to run. Redis jobs are derived from
 * these rows, so losing Redis never loses the plan.
 */
export const scheduledRuns = pgTable(
  "scheduled_runs",
  {
    id: id(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    /** Local calendar day (schedule timezone), YYYY-MM-DD. */
    runDate: text("run_date").notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).notNull(),
    plannedMessages: integer("planned_messages").notNull(),
    status: text("status", {
      enum: ["PENDING", "QUEUED", "RUNNING", "DONE", "SKIPPED", "FAILED", "CANCELLED"],
    })
      .notNull()
      .default("PENDING"),
    sessionId: uuid("session_id"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("scheduled_runs_status_run_at_idx").on(t.status, t.runAt)],
).enableRLS();
