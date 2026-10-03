import { getQueue } from "./conversationQueue";
import { QUEUES, type SchedulerJob } from "./names";

export const TICK_EVERY_MS = 5 * 60_000;

export const schedulerQueue = () =>
  getQueue<SchedulerJob>(QUEUES.scheduler, {
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 600, count: 20 },
      removeOnFail: { age: 86_400, count: 50 },
    },
  });

/** Registers the repeating planner tick (idempotent) and fires one immediately. */
export async function startSchedulerTick() {
  const q = schedulerQueue();
  await q.upsertJobScheduler(
    "tick",
    { every: TICK_EVERY_MS },
    { name: "tick", data: { kind: "tick" } },
  );
  await q.add("tick", { kind: "tick" }, { jobId: `tick-now-${Math.floor(Date.now() / 60_000)}` });
}
