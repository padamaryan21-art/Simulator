import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { topicCategories, topics } from "@/db/schema";
import type { TopicInput } from "@/validators/topics";

export type Topic = typeof topics.$inferSelect;

export const listCategories = () =>
  db.select().from(topicCategories).orderBy(asc(topicCategories.key));
export const listTopics = () => db.select().from(topics).orderBy(asc(topics.createdAt));

export async function getTopic(id: string) {
  const [row] = await db.select().from(topics).where(eq(topics.id, id));
  return row ?? null;
}

export async function createTopic(input: TopicInput) {
  const [row] = await db.insert(topics).values(input).returning();
  return row;
}

export async function updateTopic(id: string, input: Partial<TopicInput>) {
  if (!Object.keys(input).length) return getTopic(id);
  const [row] = await db.update(topics).set(input).where(eq(topics.id, id)).returning();
  return row ?? null;
}

export async function deleteTopic(id: string) {
  await db.delete(topics).where(eq(topics.id, id));
}

/** Pure: topics not in cooldown. Exported for tests. */
export function eligibleTopics(all: Topic[], now = new Date()): Topic[] {
  return all.filter(
    (t) =>
      t.active &&
      (!t.lastUsedAt || now.getTime() - t.lastUsedAt.getTime() >= t.cooldownMinutes * 60_000),
  );
}

/** Pure: priority-weighted random choice. `rand` injectable for tests. */
export function weightedPick<T extends { priority: number }>(
  items: T[],
  rand = Math.random,
): T | null {
  if (!items.length) return null;
  const weights = items.map((i) => Math.max(1, i.priority));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Chooses a topic: active, off cooldown, weighted by priority. If everything is cooling
 * down, falls back to the least recently used active topic rather than failing.
 */
export async function pickTopic(): Promise<Topic | null> {
  const all = (await listTopics()).filter((t) => t.active);
  const pick = weightedPick(eligibleTopics(all));
  if (pick) return pick;
  return (
    [...all].sort((a, b) => (a.lastUsedAt?.getTime() ?? 0) - (b.lastUsedAt?.getTime() ?? 0))[0] ??
    null
  );
}

export const markTopicUsed = (id: string) =>
  db.update(topics).set({ lastUsedAt: new Date() }).where(eq(topics.id, id));
