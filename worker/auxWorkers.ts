import { Worker } from "bullmq";
import { refreshSource } from "../src/server/knowledge/service";
import { extractMemoriesForSession } from "../src/server/memory/extract";
import { createRedisConnection } from "../src/server/queues/connection";
import { QUEUES, type KnowledgeJob, type MemoryJob } from "../src/server/queues/names";

/** memory-processing: distils facts from a finished private conversation. */
export function startMemoryWorker() {
  return new Worker<MemoryJob>(
    QUEUES.memory,
    async (job) => extractMemoriesForSession(job.data.sessionId, job.data.groupId),
    { connection: createRedisConnection("worker-memory"), concurrency: 1 },
  );
}

/** knowledge-refresh: re-fetches a source; changed pages mark confirmed facts outdated. */
export function startKnowledgeWorker() {
  return new Worker<KnowledgeJob>(
    QUEUES.knowledge,
    async (job) => refreshSource(job.data.sourceId),
    { connection: createRedisConnection("worker-knowledge"), concurrency: 1 },
  );
}
