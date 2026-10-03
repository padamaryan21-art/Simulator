import type { ShiftInstance } from "./duty";

export type PlannedRun = { runAt: Date; size: number };

export type PlanInput = {
  now: Date;
  shift: ShiftInstance;
  /** Messages still to be produced during this shift. */
  neededMessages: number;
  minSize: number;
  maxSize: number;
  rand?: () => number;
};

/** Leave this much of the shift for the last conversation to finish. */
const TAIL_MS = 10 * 60_000;
const LEAD_MS = 60_000;

/**
 * Splits `neededMessages` into conversations of minSize..maxSize messages and picks a random
 * start time for each inside the remaining part of the shift. Pure and deterministic given `rand`.
 */
export function planRuns({
  now,
  shift,
  neededMessages,
  minSize,
  maxSize,
  rand = Math.random,
}: PlanInput): PlannedRun[] {
  const from = Math.max(shift.start.getTime(), now.getTime() + LEAD_MS);
  const to = shift.end.getTime() - TAIL_MS;
  if (to - from < 60_000 || neededMessages < minSize) return [];

  const sizes: number[] = [];
  let remaining = neededMessages;
  while (remaining >= minSize) {
    const size = Math.min(remaining, minSize + Math.floor(rand() * (maxSize - minSize + 1)));
    sizes.push(size);
    remaining -= size;
  }
  // A leftover smaller than one conversation is folded into the last one if it still fits.
  if (remaining > 0 && sizes.length && sizes[sizes.length - 1] + remaining <= maxSize) {
    sizes[sizes.length - 1] += remaining;
  }

  return sizes
    .map((size) => ({ size, runAt: new Date(from + Math.floor(rand() * (to - from))) }))
    .sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
}
