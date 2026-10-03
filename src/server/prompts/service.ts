import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { promptTemplates } from "@/db/schema";
import { specProblem } from "@/lib/prompts/build";
import type { PromptInput } from "@/validators/prompts";

export type CustomPrompt = typeof promptTemplates.$inferSelect;

export class PromptError extends Error {}

export const listCustomPrompts = () =>
  db.select().from(promptTemplates).orderBy(desc(promptTemplates.createdAt));

export async function createPrompt(input: PromptInput): Promise<CustomPrompt> {
  const [row] = await db.insert(promptTemplates).values(input).returning();
  return row;
}

export async function updatePrompt(
  id: string,
  patch: Partial<PromptInput>,
): Promise<CustomPrompt | null> {
  const [current] = await db.select().from(promptTemplates).where(eq(promptTemplates.id, id));
  if (!current) return null;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (!Object.keys(clean).length) return current;
  // The edited prompt as a whole must still reach 2,000+ lines.
  const problem = specProblem({ ...current, ...clean } as never);
  if (problem) throw new PromptError(problem);
  const [row] = await db
    .update(promptTemplates)
    .set(clean)
    .where(eq(promptTemplates.id, id))
    .returning();
  return row;
}

export const deletePrompt = async (id: string) => {
  await db.delete(promptTemplates).where(eq(promptTemplates.id, id));
};
