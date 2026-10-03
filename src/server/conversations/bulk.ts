import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groups } from "@/db/schema";
import { childLogger } from "@/lib/logger";
import { bulkTotal, type BulkInput } from "@/validators/bulk";
import { writeLog } from "./logs";
import { createConversation, getSession, RuleError } from "./service";

const log = childLogger("conversation.bulk");

export type BulkJob = {
  id: string;
  groupId: string;
  status: "RUNNING" | "COMPLETED" | "CANCELLED" | "FAILED";
  targetMessages: number;
  producedMessages: number;
  conversations: number;
  failures: number;
  lastError: string | null;
  startedAt: string;
  finishedAt: string | null;
};

/** One bulk job at a time per server process; progress lives in memory (drafts persist in the DB). */
const g = globalThis as unknown as { __bulk?: { job: BulkJob | null; cancel: boolean } };
const state = (g.__bulk ??= { job: null, cancel: false });

export const getBulkJob = () => state.job;

export function cancelBulk() {
  if (state.job?.status === "RUNNING") state.cancel = true;
}

const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

function pickParticipants(ids: string[]) {
  // Not every persona joins every conversation: 2..all, random subset.
  const n = rand(2, ids.length);
  return [...ids].sort(() => Math.random() - 0.5).slice(0, n);
}

/**
 * Generates draft conversations until `targetMessages` is reached. PRIVATE_SIMULATION only.
 * Drafts are PREVIEW sessions: nothing is sent; the scheduler (Phase 7) will pace sending.
 */
export async function startBulk(input: BulkInput, userId: string): Promise<BulkJob> {
  if (state.job?.status === "RUNNING") throw new RuleError("A bulk run is already in progress.");
  const [group] = await db.select().from(groups).where(eq(groups.id, input.groupId));
  if (!group) throw new RuleError("Group not found.");
  if (group.type !== "PRIVATE_SIMULATION") {
    throw new RuleError("Bulk generation is only available for private simulation groups.");
  }

  const job: BulkJob = {
    id: crypto.randomUUID(),
    groupId: group.id,
    status: "RUNNING",
    targetMessages: bulkTotal(input),
    producedMessages: 0,
    conversations: 0,
    failures: 0,
    lastError: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  state.job = job;
  state.cancel = false;
  await writeLog("info", "bulk", "Bulk generation started", {
    target: bulkTotal(input),
    groupId: group.id,
    actorId: userId,
  });
  void run(job, input, userId);
  return job;
}

async function run(job: BulkJob, input: BulkInput, userId: string) {
  let consecutiveFailures = 0;
  try {
    while (job.producedMessages < job.targetMessages) {
      if (state.cancel) {
        job.status = "CANCELLED";
        break;
      }
      const remaining = job.targetMessages - job.producedMessages;
      const size = Math.max(
        6,
        Math.min(remaining, rand(input.minPerConversation, input.maxPerConversation)),
      );
      try {
        const res = await createConversation(
          {
            groupId: input.groupId,
            participantIds: pickParticipants(input.participantIds),
            topicId: null,
            mode: "PREVIEW",
            messageCount: size,
          },
          userId,
          { includeUnsent: true },
        );
        const s = await getSession(res.sessionId);
        job.producedMessages += s?.messages.length ?? size;
        job.conversations++;
        consecutiveFailures = 0;
      } catch (err) {
        job.failures++;
        job.lastError = (err as Error).message;
        consecutiveFailures++;
        log.warn({ err: job.lastError, consecutiveFailures }, "bulk conversation failed");
        if (consecutiveFailures >= 5) {
          job.status = "FAILED";
          break;
        }
        // Free tiers rate-limit; back off before trying again.
        await new Promise((r) => setTimeout(r, Math.min(30_000, 3000 * consecutiveFailures)));
      }
    }
    if (job.status === "RUNNING") job.status = "COMPLETED";
  } catch (err) {
    job.status = "FAILED";
    job.lastError = (err as Error).message;
  } finally {
    job.finishedAt = new Date().toISOString();
    await writeLog(
      job.status === "FAILED" ? "error" : "info",
      "bulk",
      `Bulk generation ${job.status.toLowerCase()}`,
      {
        produced: job.producedMessages,
        conversations: job.conversations,
        failures: job.failures,
      },
    );
  }
}
