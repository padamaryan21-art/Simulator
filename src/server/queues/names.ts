import { getEnv } from "@/lib/env";

export const QUEUES = {
  conversation: "conversation-generation",
  message: "message-send",
  scheduler: "scheduled-conversation",
  knowledge: "knowledge-refresh",
  memory: "memory-processing",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type ConversationJob = { runId: string };
export type MessageJob = { sessionId: string };
export type SchedulerJob = { kind: "tick" };
export type KnowledgeJob = { sourceId: string };
export type MemoryJob = { sessionId: string; groupId: string };

export const redisConfigured = () => Boolean(getEnv().REDIS_URL);
