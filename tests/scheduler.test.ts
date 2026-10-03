import { describe, expect, it } from "vitest";
import {
  activeInstance,
  instancesAround,
  isOnDuty,
  parseDutyConfig,
  quotaForShift,
  shiftInstance,
  upcomingInstances,
  type DutyConfig,
} from "@/lib/scheduling/duty";
import { planRuns } from "@/lib/scheduling/plan";
import {
  addDays,
  hhmmToMinutes,
  localDate,
  minutesToHHMM,
  weekday,
  zonedTime,
} from "@/lib/scheduling/time";

const TZ = "Asia/Manila"; // UTC+8, no DST
const manila = (iso: string) => new Date(`${iso}+08:00`);

const cfg = (
  weekly: DutyConfig["weekly"],
  overrides: DutyConfig["overrides"] = {},
): DutyConfig => ({
  timezone: TZ,
  weekly,
  overrides,
});

describe("time helpers", () => {
  it("converts local clock times to UTC instants", () => {
    expect(zonedTime("2026-10-03", 9 * 60, TZ).toISOString()).toBe("2026-10-03T01:00:00.000Z");
    expect(zonedTime("2026-10-03", 21 * 60, TZ).toISOString()).toBe("2026-10-03T13:00:00.000Z");
  });
  it("reads the local date across the UTC boundary", () => {
    // 20:00 UTC on Oct 2 is already 04:00 Oct 3 in Manila.
    expect(localDate(TZ, new Date("2026-10-02T20:00:00Z"))).toBe("2026-10-03");
  });
  it("does date arithmetic and weekdays", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekday("2026-10-03")).toBe(6); // Saturday
  });
  it("parses and formats HH:MM", () => {
    expect(hhmmToMinutes("09:30")).toBe(570);
    expect(hhmmToMinutes("24:00")).toBeNull();
    expect(hhmmToMinutes("9:5")).toBeNull();
    expect(minutesToHHMM(1260)).toBe("21:00");
  });
});

describe("duty calendar", () => {
  const allDay = cfg(
    Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { type: "DAY" as const }])),
  );

  it("day shift is 09:00-21:00 local", () => {
    const s = shiftInstance(allDay, "2026-10-03")!;
    expect(s.start.toISOString()).toBe("2026-10-03T01:00:00.000Z");
    expect(s.end.toISOString()).toBe("2026-10-03T13:00:00.000Z");
  });

  it("night shift runs past midnight into the next day", () => {
    const night = cfg({ "6": { type: "NIGHT" } }); // Saturday night
    const s = shiftInstance(night, "2026-10-03")!;
    expect(s.start).toEqual(manila("2026-10-03T21:00:00"));
    expect(s.end).toEqual(manila("2026-10-04T09:00:00"));
  });

  it("night shift is still on duty after midnight (belongs to yesterday's shift)", () => {
    const night = cfg({ "6": { type: "NIGHT" } });
    expect(isOnDuty(night, manila("2026-10-04T03:00:00"))).toBe(true);
    expect(isOnDuty(night, manila("2026-10-04T09:00:00"))).toBe(false);
    expect(activeInstance(night, manila("2026-10-04T03:00:00"))!.date).toBe("2026-10-03");
  });

  it("days with no rule are off, so nothing runs by default", () => {
    expect(isOnDuty(cfg({}), manila("2026-10-03T12:00:00"))).toBe(false);
    expect(instancesAround(cfg({}), manila("2026-10-03T12:00:00"))).toEqual([]);
  });

  it("date overrides win: a day off and a custom shift", () => {
    const c = cfg(
      { "6": { type: "DAY" } },
      {
        "2026-10-03": { type: "OFF" },
        "2026-10-10": { type: "CUSTOM", startMinute: 13 * 60, endMinute: 19 * 60 },
      },
    );
    expect(isOnDuty(c, manila("2026-10-03T12:00:00"))).toBe(false);
    expect(isOnDuty(c, manila("2026-10-10T12:00:00"))).toBe(false);
    expect(isOnDuty(c, manila("2026-10-10T14:00:00"))).toBe(true);
  });

  it("rejects an empty custom shift and tolerates malformed stored data", () => {
    expect(
      shiftInstance(
        cfg({ "6": { type: "CUSTOM", startMinute: 600, endMinute: 600 } }),
        "2026-10-03",
      ),
    ).toBeNull();
    expect(shiftInstance(cfg({ "6": { type: "CUSTOM" } }), "2026-10-03")).toBeNull();
    const parsed = parseDutyConfig(
      TZ,
      { "1": { type: "DAY" }, "2": { type: "BOGUS" }, "3": null },
      "nope",
    );
    expect(Object.keys(parsed.weekly)).toEqual(["1"]);
    expect(parsed.overrides).toEqual({});
  });

  it("lists upcoming shifts within the horizon only", () => {
    const c = cfg({ "6": { type: "DAY" }, "0": { type: "DAY" } });
    const now = manila("2026-10-03T22:00:00"); // after Saturday's shift ended
    const up = upcomingInstances(c, now, 30);
    expect(up.map((i) => i.date)).toEqual(["2026-10-04"]);
  });

  it("scales the quota by shift length (per 12h of duty)", () => {
    const day = shiftInstance(cfg({ "6": { type: "DAY" } }), "2026-10-03")!;
    expect(quotaForShift(400, day)).toBe(400);
    const short = shiftInstance(
      cfg({}, { "2026-10-03": { type: "CUSTOM", startMinute: 540, endMinute: 900 } }),
      "2026-10-03",
    )!;
    expect(quotaForShift(400, short)).toBe(200);
    const long = shiftInstance(
      cfg({}, { "2026-10-03": { type: "CUSTOM", startMinute: 0, endMinute: 23 * 60 + 59 } }),
      "2026-10-03",
    )!;
    expect(quotaForShift(400, long)).toBeLessThanOrEqual(800);
  });
});

describe("planRuns", () => {
  const shift = shiftInstance(cfg({ "6": { type: "DAY" } }), "2026-10-03")!;
  const seeded = (seed = 1) => {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  };

  it("covers the needed messages with conversations in the size range", () => {
    const runs = planRuns({
      now: manila("2026-10-03T08:00:00"),
      shift,
      neededMessages: 2000,
      minSize: 15,
      maxSize: 35,
      rand: seeded(),
    });
    const total = runs.reduce((n, r) => n + r.size, 0);
    expect(total).toBeGreaterThan(2000 - 15);
    expect(total).toBeLessThanOrEqual(2000);
    expect(runs.every((r) => r.size >= 15 && r.size <= 35)).toBe(true);
  });

  it("schedules every run inside the shift, before its tail, in order", () => {
    const now = manila("2026-10-03T08:00:00");
    const runs = planRuns({
      now,
      shift,
      neededMessages: 500,
      minSize: 15,
      maxSize: 35,
      rand: seeded(7),
    });
    for (const r of runs) {
      expect(r.runAt.getTime()).toBeGreaterThanOrEqual(shift.start.getTime());
      expect(r.runAt.getTime()).toBeLessThanOrEqual(shift.end.getTime() - 10 * 60_000);
    }
    expect([...runs].sort((a, b) => a.runAt.getTime() - b.runAt.getTime())).toEqual(runs);
  });

  it("only plans in the future when the shift is already underway", () => {
    const now = manila("2026-10-03T15:00:00");
    const runs = planRuns({
      now,
      shift,
      neededMessages: 200,
      minSize: 15,
      maxSize: 35,
      rand: seeded(3),
    });
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((r) => r.runAt.getTime() > now.getTime())).toBe(true);
  });

  it("plans nothing when the shift is over, too little remains, or the need is below one conversation", () => {
    expect(
      planRuns({
        now: manila("2026-10-03T21:00:00"),
        shift,
        neededMessages: 100,
        minSize: 15,
        maxSize: 35,
      }),
    ).toEqual([]);
    expect(
      planRuns({
        now: manila("2026-10-03T20:55:00"),
        shift,
        neededMessages: 100,
        minSize: 15,
        maxSize: 35,
      }),
    ).toEqual([]);
    expect(
      planRuns({
        now: manila("2026-10-03T08:00:00"),
        shift,
        neededMessages: 10,
        minSize: 15,
        maxSize: 35,
      }),
    ).toEqual([]);
  });

  it("works for a night shift that crosses midnight", () => {
    const night = shiftInstance(cfg({ "6": { type: "NIGHT" } }), "2026-10-03")!;
    const runs = planRuns({
      now: manila("2026-10-03T20:00:00"),
      shift: night,
      neededMessages: 300,
      minSize: 15,
      maxSize: 35,
      rand: seeded(11),
    });
    expect(runs.length).toBeGreaterThan(5);
    expect(runs.every((r) => r.runAt >= night.start && r.runAt <= night.end)).toBe(true);
  });
});

describe("a duty calendar read back from the database (regression)", () => {
  // The dashboard saves "Day shift" as just { type: "DAY" }. Reading it back used to attach
  // startMinute/endMinute = undefined, which overrode the preset hours and made every shift invalid,
  // so nothing was ever planned.
  const stored = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { type: "DAY" }]));
  const tz = "Asia/Manila";
  const noon = new Date("2026-10-03T04:00:00Z"); // 12:00 in Manila, a Saturday

  it("keeps the preset hours of a plain Day shift", async () => {
    const { parseDutyConfig, activeInstance, upcomingInstances } =
      await import("@/lib/scheduling/duty");
    const cfg = parseDutyConfig(tz, stored, {});
    expect(cfg.weekly["6"]).toEqual({ type: "DAY" }); // no undefined hour keys
    const active = activeInstance(cfg, noon)!;
    expect(active.start.toISOString()).toBe("2026-10-03T01:00:00.000Z"); // 09:00 Manila
    expect(active.end.toISOString()).toBe("2026-10-03T13:00:00.000Z"); // 21:00 Manila
    expect(upcomingInstances(cfg, noon).length).toBeGreaterThan(0);
  });

  it("keeps the preset hours of a plain Night shift, which ends the next morning", async () => {
    const { parseDutyConfig, shiftInstance } = await import("@/lib/scheduling/duty");
    const night = Object.fromEntries(Object.keys(stored).map((d) => [d, { type: "NIGHT" }]));
    const i = shiftInstance(parseDutyConfig(tz, night, {}), "2026-10-03")!;
    expect(i.start.toISOString()).toBe("2026-10-03T13:00:00.000Z"); // 21:00 Manila
    expect(i.end.toISOString()).toBe("2026-10-04T01:00:00.000Z"); // 09:00 next day
  });

  it("still honours hours that were really saved, and custom shifts", async () => {
    const { parseDutyConfig, shiftInstance } = await import("@/lib/scheduling/duty");
    const cfg = parseDutyConfig(
      tz,
      { "6": { type: "DAY", startMinute: 600, endMinute: 1080 } },
      { "2026-10-03": { type: "CUSTOM", startMinute: 480, endMinute: 720 } },
    );
    const custom = shiftInstance(cfg, "2026-10-03")!; // the override wins
    expect(custom.start.toISOString()).toBe("2026-10-03T00:00:00.000Z"); // 08:00 Manila
    expect(custom.end.toISOString()).toBe("2026-10-03T04:00:00.000Z"); // 12:00 Manila
    const noOverride = parseDutyConfig(
      tz,
      { "6": { type: "DAY", startMinute: 600, endMinute: 1080 } },
      {},
    );
    expect(shiftInstance(noOverride, "2026-10-03")!.start.toISOString()).toBe(
      "2026-10-03T02:00:00.000Z",
    ); // 10:00 Manila
  });

  it("a day with no rule, or OFF, has no shift", async () => {
    const { parseDutyConfig, shiftInstance } = await import("@/lib/scheduling/duty");
    expect(
      shiftInstance(parseDutyConfig(tz, { "6": { type: "OFF" } }, {}), "2026-10-03"),
    ).toBeNull();
    expect(shiftInstance(parseDutyConfig(tz, {}, {}), "2026-10-03")).toBeNull();
  });
});
