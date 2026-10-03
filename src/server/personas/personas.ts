import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { personas } from "@/db/schema";
import type { PersonaInput } from "@/validators/personas";

export type Persona = typeof personas.$inferSelect;

export const listPersonas = () => db.select().from(personas).orderBy(asc(personas.createdAt));

export async function getPersona(id: string) {
  const [row] = await db.select().from(personas).where(eq(personas.id, id));
  return row ?? null;
}

export async function createPersona(input: PersonaInput) {
  const [row] = await db.insert(personas).values(input).returning();
  return row;
}

export async function updatePersona(id: string, input: Partial<PersonaInput>) {
  if (!Object.keys(input).length) return getPersona(id);
  const [row] = await db.update(personas).set(input).where(eq(personas.id, id)).returning();
  return row ?? null;
}

export async function deletePersona(id: string) {
  await db.delete(personas).where(eq(personas.id, id));
}
