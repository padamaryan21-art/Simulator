import { asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { conversationSessions, groupParticipants, groups } from "@/db/schema";
import type { CreateGroupInput, UpdateGroupInput } from "@/validators/telegram";

export type GroupWithParticipants = typeof groups.$inferSelect & { participantIds: string[] };

export async function listGroups(): Promise<GroupWithParticipants[]> {
  const rows = await db.select().from(groups).orderBy(asc(groups.createdAt));
  if (!rows.length) return [];
  const parts = await db
    .select()
    .from(groupParticipants)
    .where(
      inArray(
        groupParticipants.groupId,
        rows.map((r) => r.id),
      ),
    );
  return rows.map((g) => ({
    ...g,
    participantIds: parts.filter((p) => p.groupId === g.id).map((p) => p.personaId),
  }));
}

export async function getGroup(id: string) {
  const [g] = await db.select().from(groups).where(eq(groups.id, id));
  return g ?? null;
}

async function setParticipants(groupId: string, personaIds: string[]) {
  await db.delete(groupParticipants).where(eq(groupParticipants.groupId, groupId));
  if (personaIds.length) {
    await db
      .insert(groupParticipants)
      .values(personaIds.map((personaId) => ({ groupId, personaId })));
  }
}

export async function createGroup(input: CreateGroupInput) {
  const { participantIds, ...values } = input;
  const [row] = await db.insert(groups).values(values).returning();
  await setParticipants(row.id, participantIds);
  return row;
}

export class GroupRuleError extends Error {}

export async function updateGroup(id: string, input: UpdateGroupInput) {
  const existing = await getGroup(id);
  if (!existing) return null;
  const { participantIds, ...values } = input;

  const type = values.type ?? existing.type;
  const automation = values.automationEnabled ?? existing.automationEnabled;
  const approval = values.requiresApproval ?? existing.requiresApproval;
  if (type === "REAL_COMMUNITY" && (automation || !approval)) {
    throw new GroupRuleError("REAL_COMMUNITY groups must require approval and cannot be automated");
  }

  // A body with only participantIds has no columns to update (and Drizzle rejects an empty SET).
  const [row] = Object.keys(values).length
    ? await db.update(groups).set(values).where(eq(groups.id, id)).returning()
    : [existing];
  if (participantIds) await setParticipants(id, participantIds);
  return row;
}

export async function deleteGroup(id: string) {
  // Conversation history is kept on purpose (it is the record of what was sent), so a group that
  // still has any cannot be removed. Say so instead of failing with a database error.
  const [{ n }] = await db
    .select({ n: count() })
    .from(conversationSessions)
    .where(eq(conversationSessions.groupId, id));
  if (n > 0)
    throw new GroupRuleError(
      `This group still has ${n} conversation${n === 1 ? "" : "s"} in History. Delete ${n === 1 ? "it" : "them"} first (History → Conversations), or just switch the group off with Active and Automation.`,
    );
  await db.delete(groups).where(eq(groups.id, id));
}
