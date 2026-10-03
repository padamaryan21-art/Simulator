import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { groupMemories, personaMemories, relationshipMemories } from "@/db/schema";
import type { MemoryCreateInput, MemoryScope } from "@/validators/personas";

export type MemoryRecord = {
  id: string;
  scope: MemoryScope;
  ownerId: string;
  content: string;
  importance: number;
  sourceSessionId: string | null;
  createdAt: Date;
};

const tables = {
  persona: { table: personaMemories, ownerCol: personaMemories.personaId },
  relationship: { table: relationshipMemories, ownerCol: relationshipMemories.relationshipId },
  group: { table: groupMemories, ownerCol: groupMemories.groupId },
} as const;

type Row = {
  id: string;
  content: string;
  importance: number;
  sourceSessionId: string | null;
  createdAt: Date;
} & Record<string, unknown>;

const ownerKey = {
  persona: "personaId",
  relationship: "relationshipId",
  group: "groupId",
} as const;

function toRecord(scope: MemoryScope, row: Row): MemoryRecord {
  return {
    id: row.id,
    scope,
    ownerId: row[ownerKey[scope]] as string,
    content: row.content,
    importance: row.importance,
    sourceSessionId: row.sourceSessionId,
    createdAt: row.createdAt,
  };
}

export async function listMemories(scope: MemoryScope, ownerId?: string): Promise<MemoryRecord[]> {
  const { table, ownerCol } = tables[scope];
  const q = db.select().from(table as typeof personaMemories);
  const rows = (ownerId
    ? await q
        .where(eq(ownerCol as typeof personaMemories.personaId, ownerId))
        .orderBy(desc(table.createdAt))
    : await q.orderBy(desc(table.createdAt))) as unknown as Row[];
  return rows.map((r) => toRecord(scope, r));
}

export async function createMemory(
  input: MemoryCreateInput,
  sourceSessionId?: string,
): Promise<MemoryRecord> {
  const base = { content: input.content, importance: input.importance, sourceSessionId };
  let row: Row;
  switch (input.scope) {
    case "persona":
      [row] = (await db
        .insert(personaMemories)
        .values({ ...base, personaId: input.ownerId })
        .returning()) as unknown as Row[];
      break;
    case "relationship":
      [row] = (await db
        .insert(relationshipMemories)
        .values({ ...base, relationshipId: input.ownerId })
        .returning()) as unknown as Row[];
      break;
    case "group":
      [row] = (await db
        .insert(groupMemories)
        .values({ ...base, groupId: input.ownerId })
        .returning()) as unknown as Row[];
      break;
  }
  return toRecord(input.scope, row);
}

export async function updateMemory(
  scope: MemoryScope,
  id: string,
  patch: { content?: string; importance?: number },
) {
  const { table } = tables[scope];
  if (patch.content === undefined && patch.importance === undefined) {
    const [current] = (await db
      .select()
      .from(table as typeof personaMemories)
      .where(eq(table.id, id))) as unknown as Row[];
    return current ? toRecord(scope, current) : null;
  }
  const [row] = (await db
    .update(table as typeof personaMemories)
    .set(patch)
    .where(eq(table.id, id))
    .returning()) as unknown as Row[];
  return row ? toRecord(scope, row) : null;
}

export async function deleteMemory(scope: MemoryScope, id: string) {
  const { table } = tables[scope];
  await db.delete(table as typeof personaMemories).where(eq(table.id, id));
}
