import { Queue, type QueueOptions } from "bullmq";
import { getSharedConnection } from "./connection";
import { QUEUES, type ConversationJob, type KnowledgeJob, type MemoryJob } from "./names";

const g = globalThis as unknown as { __queues?: Map<string, Queue> };
const cache = (g.__queues ??= new Map());

/** Lazily created, process-wide Queue producers sharing one Redis connection. */
export function getQueue<T = unknown>(
  name: string,
  defaults: Omit<QueueOptions, "connection"> = {},
) {
  let q = cache.get(name);
  if (!q) {
    q = new Queue(name, { connection: getSharedConnection(), ...defaults });
    cache.set(name, q);
  }
  return q as Queue<T>;
}

const keep = {
  removeOnComplete: { age: 3600, count: 200 },
  removeOnFail: { age: 7 * 86_400, count: 500 },
};

export const conversationQueue = () =>
  getQueue<ConversationJob>(QUEUES.conversation, {
    defaultJobOptions: { ...keep, attempts: 2, backoff: { type: "exponential", delay: 30_000 } },
  });

export const knowledgeQueue = () =>
  getQueue<KnowledgeJob>(QUEUES.knowledge, { defaultJobOptions: { ...keep, attempts: 1 } });

export const memoryQueue = () =>
  getQueue<MemoryJob>(QUEUES.memory, {
    defaultJobOptions: { ...keep, attempts: 2, backoff: { type: "exponential", delay: 15_000 } },
  });

/** jobId = run id, so a run can never be queued twice. */
export const enqueueConversation = (runId: string) =>
  conversationQueue().add("generate", { runId }, { jobId: `run-${runId}` });

export const enqueueMemory = (sessionId: string, groupId: string) =>
  memoryQueue().add("extract", { sessionId, groupId }, { jobId: `mem-${sessionId}` });

export const enqueueKnowledgeRefresh = (sourceId: string) =>
  knowledgeQueue().add("refresh", { sourceId }, { jobId: `kn-${sourceId}-${Date.now()}` });
