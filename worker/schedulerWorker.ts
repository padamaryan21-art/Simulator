import { Worker } from "bullmq";
import { childLogger } from "../src/lib/logger";
import { enqueueConversation } from "../src/server/queues/conversationQueue";
import { createRedisConnection } from "../src/server/queues/connection";
import { messageQueue, enqueueMessageSend } from "../src/server/queues/messageQueue";
import { QUEUES, type SchedulerJob } from "../src/server/queues/names";
import { getAutomationState } from "../src/server/scheduler/control";
import {
  claimDueRuns,
  ensurePlans,
  requeueStaleRuns,
  setRunStatus,
  syncFinishedRuns,
} from "../src/server/scheduler/planner";
import { db } from "../src/db";
import { conversationSessions } from "../src/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";

const log = childLogger("worker.scheduler");

/**
 * Sessions created by the scheduler that are marked SENDING but have no live send job (the worker
 * crashed, or Redis was reset) are re-queued so they finish instead of hanging forever.
 * Manual sessions are deliberately excluded: they may be running in the dashboard process.
 */
async function recoverStuckSessions() {
  const stuck = await db
    .select({ id: conversationSessions.id })
    .from(conversationSessions)
    .where(
      and(
        eq(conversationSessions.status, "SENDING"),
        eq(conversationSessions.mode, "AUTOMATIC"),
        isNotNull(conversationSessions.scheduleId),
      ),
    );
  let recovered = 0;
  for (const { id } of stuck) {
    const job = await messageQueue().getJob(`send-${id}`);
    if (job) {
      const state = await job.getState();
      if (["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(state))
        continue;
      await job.remove().catch(() => undefined);
    }
    await enqueueMessageSend(id);
    recovered++;
  }
  return recovered;
}

/** One planner tick: reconcile state, top up the plan, and dispatch runs that are due. */
export async function tick() {
  await syncFinishedRuns();
  const requeued = await requeueStaleRuns();
  const recovered = await recoverStuckSessions();
  const state = await getAutomationState();
  if (state !== "RUNNING") return { state, requeued, recovered, planned: 0, dispatched: 0 };

  const { created } = await ensurePlans();
  const due = await claimDueRuns();
  let dispatched = 0;
  for (const id of due) {
    try {
      await enqueueConversation(id);
      dispatched++;
    } catch (err) {
      log.warn({ runId: id, err: (err as Error).message }, "enqueue failed; will retry next tick");
      await setRunStatus(id, "PENDING");
    }
  }
  return { state, requeued, recovered, planned: created, dispatched };
}

export function startSchedulerWorker() {
  return new Worker<SchedulerJob>(
    QUEUES.scheduler,
    async () => {
      const result = await tick();
      log.info(result, "scheduler tick");
      return result;
    },
    { connection: createRedisConnection("worker-scheduler"), concurrency: 1 },
  );
}
