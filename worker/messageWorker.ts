import { Worker } from "bullmq";
import { runSender } from "../src/server/conversations/sender";
import { createRedisConnection } from "../src/server/queues/connection";
import { QUEUES, type MessageJob } from "../src/server/queues/names";

/**
 * Sends one conversation's approved messages with delays. A session can take many minutes, so
 * several run in parallel (different accounts interleave naturally). Telegram pacing per account
 * is enforced inside the sender through a shared Redis gap, not by this concurrency number.
 */
export function startMessageWorker() {
  const concurrency = Number(process.env.WORKER_SEND_CONCURRENCY ?? 3);
  return new Worker<MessageJob>(
    QUEUES.message,
    async (job) => runSender(job.data.sessionId, null),
    {
      connection: createRedisConnection("worker-message"),
      concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 3,
      // Long-running jobs: keep the lock alive and tolerate slow event-loop turns.
      lockDuration: 60_000,
    },
  );
}
