import { addDays, localDate, weekday, zonedTime } from "./time";

/**
 * The operator's duty calendar. The simulation only generates and sends while "on duty".
 * Day shift 09:00-21:00, night shift 21:00-09:00 (next day), custom hours, or day off.
 */

export type ShiftType = "DAY" | "NIGHT" | "CUSTOM" | "OFF";
export type ShiftRule = { type: ShiftType; startMinute?: number; endMinute?: number };

export const SHIFT_PRESETS = {
  DAY: { startMinute: 9 * 60, endMinute: 21 * 60 },
  NIGHT: { startMinute: 21 * 60, endMinute: 9 * 60 },
} as const;

export type DutyConfig = {
  timezone: string;
  /** Keys "0".."6" (0 = Sunday). Missing day = off. */
  weekly: Record<string, ShiftRule | undefined>;
  /** Keys YYYY-MM-DD. An override wins over the weekly pattern (use OFF for a day off). */
  overrides: Record<string, ShiftRule | undefined>;
};

export type ShiftInstance = {
  /** Local date the shift STARTS on. */
  date: string;
  start: Date;
  end: Date;
  type: Exclude<ShiftType, "OFF">;
};

export function resolveRule(cfg: DutyConfig, date: string): ShiftRule {
  return cfg.overrides[date] ?? cfg.weekly[String(weekday(date))] ?? { type: "OFF" };
}

/** Concrete start/end instants for the shift that begins on `date`, or null if off/invalid. */
export function shiftInstance(cfg: DutyConfig, date: string): ShiftInstance | null {
  const rule = resolveRule(cfg, date);
  if (rule.type === "OFF") return null;
  const { startMinute, endMinute } =
    rule.type === "CUSTOM" ? rule : { ...SHIFT_PRESETS[rule.type], ...rule };
  if (startMinute === undefined || endMinute === undefined || startMinute === endMinute)
    return null;
  const start = zonedTime(date, startMinute, cfg.timezone);
  // An end at or before the start means the shift runs past midnight (e.g. 21:00 -> 09:00).
  const end = zonedTime(endMinute > startMinute ? date : addDays(date, 1), endMinute, cfg.timezone);
  return { date, start, end, type: rule.type };
}

/** All shift instances that could overlap [now - 1 day, now + 2 days], ordered by start. */
export function instancesAround(cfg: DutyConfig, now: Date): ShiftInstance[] {
  const today = localDate(cfg.timezone, now);
  return [-1, 0, 1, 2]
    .map((d) => shiftInstance(cfg, addDays(today, d)))
    .filter((i): i is ShiftInstance => i !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function activeInstance(cfg: DutyConfig, now: Date): ShiftInstance | null {
  const t = now.getTime();
  return (
    instancesAround(cfg, now).find((i) => i.start.getTime() <= t && t < i.end.getTime()) ?? null
  );
}

export const isOnDuty = (cfg: DutyConfig, now: Date) => activeInstance(cfg, now) !== null;

/** Shifts that have not finished yet and start within the horizon (for planning). */
export function upcomingInstances(cfg: DutyConfig, now: Date, horizonHours = 30): ShiftInstance[] {
  const limit = now.getTime() + horizonHours * 3600_000;
  return instancesAround(cfg, now).filter(
    (i) => i.end.getTime() > now.getTime() && i.start.getTime() < limit,
  );
}

export const shiftHours = (i: ShiftInstance) => (i.end.getTime() - i.start.getTime()) / 3600_000;

/**
 * Messages per account for a shift. The configured quota is "per 12 hours on duty", so a
 * shorter custom shift gets proportionally less (and a longer one more, capped at 2x).
 */
export function quotaForShift(quotaPer12h: number, i: ShiftInstance): number {
  return Math.round(quotaPer12h * Math.min(2, shiftHours(i) / 12));
}

/** Parses stored JSON into a DutyConfig, ignoring malformed entries. */
export function parseDutyConfig(timezone: string, weekly: unknown, overrides: unknown): DutyConfig {
  const clean = (v: unknown): Record<string, ShiftRule> => {
    const out: Record<string, ShiftRule> = {};
    if (v && typeof v === "object") {
      for (const [k, r] of Object.entries(v as Record<string, unknown>)) {
        const rule = r as Partial<ShiftRule> | null;
        if (rule && ["DAY", "NIGHT", "CUSTOM", "OFF"].includes(rule.type as string)) {
          out[k] = {
            type: rule.type as ShiftType,
            startMinute: typeof rule.startMinute === "number" ? rule.startMinute : undefined,
            endMinute: typeof rule.endMinute === "number" ? rule.endMinute : undefined,
          };
        }
      }
    }
    return out;
  };
  return { timezone, weekly: clean(weekly), overrides: clean(overrides) };
}
