import { Worker } from "bullmq";
import { createRedisConnection } from "../src/server/queues/connection";
import { QUEUES, type ConversationJob } from "../src/server/queues/names";
import { executeRun } from "../src/server/scheduler/runner";

/**
 * Generates (or claims a draft for) one planned conversation and hands it to the sender queue.
 * One at a time by default: free-tier LLM quotas rate-limit quickly under parallel requests, and
 * generation (seconds) is far faster than sending (minutes), so it is never the bottleneck.
 */
export function startConversationWorker() {
  return new Worker<ConversationJob>(
    QUEUES.conversation,
    async (job) => executeRun(job.data.runId),
    {
      connection: createRedisConnection("worker-conversation"),
      concurrency: Math.max(1, Number(process.env.WORKER_GENERATION_CONCURRENCY ?? 1) || 1),
    },
  );
}
