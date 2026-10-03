import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { relationships } from "@/db/schema";
import type { RelationshipInput } from "@/validators/personas";

export class RelationshipConflictError extends Error {}

export const listRelationships = () =>
  db.select().from(relationships).orderBy(asc(relationships.createdAt));

/** A pair is unordered: (A,B) and (B,A) are the same relationship. */
async function pairExists(a: string, b: string) {
  const [row] = await db
    .select({ id: relationships.id })
    .from(relationships)
    .where(
      or(
        and(eq(relationships.personaAId, a), eq(relationships.personaBId, b)),
        and(eq(relationships.personaAId, b), eq(relationships.personaBId, a)),
      ),
    );
  return Boolean(row);
}

export async function createRelationship(input: RelationshipInput) {
  if (await pairExists(input.personaAId, input.personaBId)) {
    throw new RelationshipConflictError("These two personas already have a relationship");
  }
  const [row] = await db.insert(relationships).values(input).returning();
  return row;
}

export async function updateRelationship(id: string, input: Partial<RelationshipInput>) {
  if (!Object.keys(input).length) {
    const [current] = await db.select().from(relationships).where(eq(relationships.id, id));
    return current ?? null;
  }
  const [row] = await db
    .update(relationships)
    .set(input)
    .where(eq(relationships.id, id))
    .returning();
  return row ?? null;
}

export async function deleteRelationship(id: string) {
  await db.delete(relationships).where(eq(relationships.id, id));
}
