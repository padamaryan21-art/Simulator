import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  conversationMessages,
  conversationSessions,
  groupParticipants,
  groups,
  personas,
  telegramAccounts,
  topics,
} from "@/db/schema";
import { buildConversationContext } from "@/server/claude/contextBuilder";
import { generateConversation } from "@/server/claude/conversationGenerator";
import { regenerateMessage } from "@/server/claude/responseGenerator";
import { getAutomationState } from "@/server/scheduler/control";
import type { CreateConversationInput } from "@/validators/conversations";
import { isDryRun } from "@/lib/env";
import { attachImage, detachImage, maybeAddImageMessage } from "@/server/images/service";
import { childLogger } from "@/lib/logger";
import { writeLog } from "./logs";
import {
  RuleError,
  assertModeAllowed,
  canEditSession,
  isApprovable,
  statusAfterEdit,
} from "./rules";
import { markTopicUsed, pickTopic } from "./topics";
import { enqueueMessageSend } from "@/server/queues/messageQueue";
import { redisConfigured } from "@/server/queues/names";
import { isWorkerAlive } from "@/server/queues/workerStatus";
import { runSender } from "./sender";

const log = childLogger("conversations");

export { RuleError };

export class NotFoundError extends Error {}

export async function createConversation(
  input: CreateConversationInput,
  userId: string | null,
  opts: { includeUnsent?: boolean; scheduleId?: string; startSending?: boolean } = {},
) {
  const [group] = await db.select().from(groups).where(eq(groups.id, input.groupId));
  if (!group) throw new NotFoundError("Group not found");
  if (!group.active) throw new RuleError("This group is inactive.");

  assertModeAllowed(input.mode, group, await getAutomationState());

  const members = await db
    .select({ personaId: groupParticipants.personaId })
    .from(groupParticipants)
    .where(eq(groupParticipants.groupId, group.id));
  const memberIds = new Set(members.map((m) => m.personaId));
  const outsiders = input.participantIds.filter((id) => !memberIds.has(id));
  if (outsiders.length)
    throw new RuleError("Some selected personas are not participants of this group.");

  const ps = await db.select().from(personas).where(inArray(personas.id, input.participantIds));
  const active = ps.filter((p) => p.active);
  if (active.length < 2) throw new RuleError("At least two active personas are required.");

  const topic = input.topicId
    ? (await db.select().from(topics).where(eq(topics.id, input.topicId)))[0]
    : await pickTopic();

  const ctx = await buildConversationContext({
    groupId: group.id,
    participantIds: active.map((p) => p.id),
    topicId: topic?.id ?? null,
    messageCount: input.messageCount,
    instruction: input.instruction,
    includeUnsent: opts.includeUnsent,
  });
  const result = await generateConversation(ctx);

  const personaByName = new Map(active.map((p) => [p.name, p]));
  const automatic = input.mode === "AUTOMATIC";
  const now = new Date();

  const session = await db.transaction(async (tx) => {
    const [s] = await tx
      .insert(conversationSessions)
      .values({
        groupId: group.id,
        topicId: topic?.id ?? null,
        mode: input.mode,
        status: input.mode === "PREVIEW" ? "DRAFT" : "PENDING_APPROVAL",
        environment: group.type,
        scheduleId: opts.scheduleId ?? null,
      })
      .returning();
    await tx.insert(conversationMessages).values(
      result.messages.map((m, i) => {
        const p = personaByName.get(m.speaker)!;
        return {
          sessionId: s.id,
          personaId: p.id,
          telegramAccountId: p.telegramAccountId,
          position: i,
          content: m.text,
          // Automatic mode (private simulation only) pre-approves; `approvedBy` stays null,
          // which the sender refuses for real communities.
          status: automatic ? ("APPROVED" as const) : ("GENERATED" as const),
          approvedAt: automatic ? now : null,
        };
      }),
    );
    return s;
  });

  if (topic) await markTopicUsed(topic.id);
  // If this topic has an unused picture whose sender is in the conversation, it may be added.
  // A problem here must never lose the conversation that was just generated.
  await maybeAddImageMessage({
    sessionId: session.id,
    topicId: topic?.id ?? null,
    participantIds: active.map((p) => p.id),
    automatic,
  }).catch((err) => log.warn({ err: (err as Error).message }, "could not add an image"));
  await writeLog("info", "conversation", "Conversation generated", {
    sessionId: session.id,
    groupId: group.id,
    mode: input.mode,
    messages: result.messages.length,
    provider: result.provider,
    model: result.model,
    warnings: result.warnings.length,
    ...(userId ? { actorId: userId } : {}),
  });

  // The scheduler passes startSending: false and starts the send itself (through the queue).
  if (automatic && opts.startSending !== false) await startSend(session.id, userId);

  return {
    sessionId: session.id,
    warnings: result.warnings,
    provider: result.provider,
    model: result.model,
  };
}

export async function listSessions(limit = 1000) {
  const rows = await db
    .select({
      session: conversationSessions,
      groupName: groups.name,
      topicTitle: topics.title,
    })
    .from(conversationSessions)
    .innerJoin(groups, eq(conversationSessions.groupId, groups.id))
    .leftJoin(topics, eq(conversationSessions.topicId, topics.id))
    .orderBy(asc(conversationSessions.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r.session,
    groupName: r.groupName,
    topicTitle: r.topicTitle ?? r.session.title,
  }));
}

export async function getSession(id: string) {
  const [row] = await db
    .select({ session: conversationSessions, group: groups, topicTitle: topics.title })
    .from(conversationSessions)
    .innerJoin(groups, eq(conversationSessions.groupId, groups.id))
    .leftJoin(topics, eq(conversationSessions.topicId, topics.id))
    .where(eq(conversationSessions.id, id));
  if (!row) return null;
  const messages = await db
    .select({
      message: conversationMessages,
      personaName: personas.name,
    })
    .from(conversationMessages)
    .leftJoin(personas, eq(conversationMessages.personaId, personas.id))
    .where(eq(conversationMessages.sessionId, id))
    .orderBy(asc(conversationMessages.position));
  return {
    session: row.session,
    group: row.group,
    topicTitle: row.topicTitle ?? row.session.title,
    messages: messages.map((m) => ({ ...m.message, personaName: m.personaName ?? "Unknown" })),
  };
}

async function loadMessage(messageId: string) {
  const [m] = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.id, messageId));
  if (!m) throw new NotFoundError("Message not found");
  const [s] = await db
    .select()
    .from(conversationSessions)
    .where(eq(conversationSessions.id, m.sessionId));
  if (!canEditSession(s.status) || m.status === "SENT") {
    throw new RuleError("This conversation can no longer be edited.");
  }
  return { m, s };
}

export async function editMessage(
  messageId: string,
  patch: { content?: string; action?: "skip" | "restore"; imageId?: string | null },
) {
  const { m } = await loadMessage(messageId);
  // Attaching or removing a picture changes what will be posted, so it revokes approval too.
  if (patch.imageId === null) await detachImage(messageId);
  else if (patch.imageId !== undefined) await attachImage(messageId, patch.imageId);
  const set: Partial<typeof conversationMessages.$inferInsert> = {};
  if (patch.content !== undefined && patch.content !== m.content) {
    set.content = patch.content;
    set.status = statusAfterEdit();
    set.approvedAt = null;
    set.approvedBy = null;
  }
  if (patch.action === "skip") {
    set.status = "SKIPPED";
    set.approvedAt = null;
    set.approvedBy = null;
  } else if (patch.action === "restore") {
    set.status = "EDITED";
  }
  if (!Object.keys(set).length) return m;
  const [row] = await db
    .update(conversationMessages)
    .set(set)
    .where(eq(conversationMessages.id, messageId))
    .returning();
  return row;
}

export async function deleteMessage(messageId: string) {
  await loadMessage(messageId);
  await db.delete(conversationMessages).where(eq(conversationMessages.id, messageId));
}

export async function regenerateMessageById(messageId: string) {
  const { s } = await loadMessage(messageId);
  const rows = await db
    .select({ message: conversationMessages, personaName: personas.name })
    .from(conversationMessages)
    .leftJoin(personas, eq(conversationMessages.personaId, personas.id))
    .where(eq(conversationMessages.sessionId, s.id))
    .orderBy(asc(conversationMessages.position));
  const convo = rows.map((r) => ({
    id: r.message.id,
    speaker: r.personaName ?? "?",
    text: r.message.content,
  }));
  const index = convo.findIndex((c) => c.id === messageId);

  const participantIds = [
    ...new Set(rows.map((r) => r.message.personaId).filter((x): x is string => !!x)),
  ];
  const ctx = await buildConversationContext({
    groupId: s.groupId,
    participantIds,
    topicId: s.topicId,
    messageCount: convo.length,
    excludeSessionId: s.id,
  });
  const text = await regenerateMessage(ctx, convo, index);
  const [row] = await db
    .update(conversationMessages)
    .set({ content: text, status: statusAfterEdit(), approvedAt: null, approvedBy: null })
    .where(eq(conversationMessages.id, messageId))
    .returning();
  return row;
}

/** Human approval. `userId` is recorded; real-community sends require it. */
export async function approveMessages(sessionId: string, userId: string, messageIds?: string[]) {
  const [s] = await db
    .select()
    .from(conversationSessions)
    .where(eq(conversationSessions.id, sessionId));
  if (!s) throw new NotFoundError("Conversation not found");
  if (s.mode === "PREVIEW") {
    throw new RuleError("This is a preview. Enable sending first to approve messages.");
  }
  if (!canEditSession(s.status))
    throw new RuleError("This conversation can no longer be approved.");

  const msgs = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.sessionId, sessionId));
  const targets = msgs.filter(
    (m) => isApprovable(m.status) && (!messageIds || messageIds.includes(m.id)),
  );
  if (!targets.length) return { approved: 0 };

  await db
    .update(conversationMessages)
    .set({ status: "APPROVED", approvedAt: new Date(), approvedBy: userId })
    .where(
      inArray(
        conversationMessages.id,
        targets.map((t) => t.id),
      ),
    );
  await writeLog("info", "approval", "Messages approved", {
    sessionId,
    count: targets.length,
    environment: s.environment,
    actorId: userId,
  });
  return { approved: targets.length };
}

/** Turns a PREVIEW into a MANUAL session so its messages can be approved and sent. */
export async function enableSending(sessionId: string) {
  const [s] = await db
    .select()
    .from(conversationSessions)
    .where(eq(conversationSessions.id, sessionId));
  if (!s) throw new NotFoundError("Conversation not found");
  if (s.mode !== "PREVIEW") return s;
  const [row] = await db
    .update(conversationSessions)
    .set({ mode: "MANUAL", status: "PENDING_APPROVAL" })
    .where(eq(conversationSessions.id, sessionId))
    .returning();
  return row;
}

/** Validates everything, marks the session SENDING and starts the sender in the background. */
export async function startSend(sessionId: string, userId: string | null) {
  const data = await getSession(sessionId);
  if (!data) throw new NotFoundError("Conversation not found");
  const { session, group, messages } = data;

  if (session.mode === "PREVIEW") throw new RuleError("Preview sessions cannot be sent.");
  if (session.status === "SENDING") throw new RuleError("Already sending.");
  if (!canEditSession(session.status))
    throw new RuleError("This conversation is already finished.");
  if (!group.active) throw new RuleError("This group is inactive.");
  if (!group.url && !group.telegramChatId && !isDryRun()) {
    throw new RuleError("The group has no Telegram link or chat id.");
  }
  if (session.mode === "AUTOMATIC")
    assertModeAllowed("AUTOMATIC", group, await getAutomationState());

  const approved = messages.filter((m) => m.status === "APPROVED");
  if (!approved.length) throw new RuleError("Approve at least one message first.");
  if (group.type === "REAL_COMMUNITY" && approved.some((m) => !m.approvedBy)) {
    throw new RuleError("Real community messages must be approved by a signed-in person.");
  }

  // Every approved message needs a connected sender account.
  const accountIds = [
    ...new Set(approved.map((m) => m.telegramAccountId).filter((x): x is string => !!x)),
  ];
  const accounts = accountIds.length
    ? await db.select().from(telegramAccounts).where(inArray(telegramAccounts.id, accountIds))
    : [];
  const bad = approved.filter((m) => {
    const a = accounts.find((x) => x.id === m.telegramAccountId);
    return !a || a.status !== "CONNECTED" || (!isDryRun() && !a.encryptedSession);
  });
  if (bad.length) {
    const names = [...new Set(bad.map((m) => m.personaName))].join(", ");
    throw new RuleError(`Connect a Telegram account for: ${names}`);
  }

  const claimed = await db
    .update(conversationSessions)
    .set({ status: "SENDING", startedAt: new Date() })
    .where(
      and(
        eq(conversationSessions.id, sessionId),
        inArray(conversationSessions.status, ["DRAFT", "PENDING_APPROVAL"]),
      ),
    )
    .returning({ id: conversationSessions.id });
  if (!claimed.length) throw new RuleError("Already sending.");

  await writeLog("info", "send", "Sending started", {
    sessionId,
    environment: session.environment,
    messages: approved.length,
    ...(userId ? { actorId: userId } : {}),
  });
  await dispatchSend(sessionId, userId);
  return { started: approved.length };
}

export async function cancelSession(sessionId: string, userId: string) {
  await db
    .update(conversationMessages)
    .set({ status: "CANCELLED" })
    .where(
      and(
        eq(conversationMessages.sessionId, sessionId),
        inArray(conversationMessages.status, ["APPROVED", "SCHEDULED"]),
      ),
    );
  await db
    .update(conversationSessions)
    .set({ status: "CANCELLED", endedAt: new Date() })
    .where(
      and(
        eq(conversationSessions.id, sessionId),
        inArray(conversationSessions.status, ["DRAFT", "PENDING_APPROVAL", "SENDING"]),
      ),
    );
  await writeLog("warn", "send", "Conversation cancelled", { sessionId, actorId: userId });
}

/**
 * Sends go through the BullMQ worker when one is online (restart-safe, concurrency-limited).
 * With no worker, or no Redis, they run in this process so manual sends always work.
 */
async function dispatchSend(sessionId: string, userId: string | null) {
  if (redisConfigured() && (await isWorkerAlive())) {
    try {
      await enqueueMessageSend(sessionId);
      return;
    } catch {
      /* fall through to in-process sending */
    }
  }
  void runSender(sessionId, userId);
}
