import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { websiteFacts } from "@/db/schema";

export type KnowledgeFact = {
  fact: string;
  sourceUrl: string;
  status: "CONFIRMED" | "OUTDATED" | "UNKNOWN";
};

/**
 * Returns facts the AI may rely on. Only CONFIRMED facts are offered as usable;
 * the context builder tells the model that anything not listed is unknown.
 * (Full extraction/refresh pipeline arrives in Phase 5.)
 */
export async function getConfirmedFacts(limit = 20): Promise<KnowledgeFact[]> {
  const rows = await db
    .select()
    .from(websiteFacts)
    .where(eq(websiteFacts.status, "CONFIRMED"))
    .orderBy(desc(websiteFacts.verifiedAt))
    .limit(limit);
  return rows.map((r) => ({ fact: r.fact, sourceUrl: r.sourceUrl, status: r.status }));
}
