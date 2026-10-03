import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  conversationMessages,
  groupMemories,
  personaMemories,
  personas,
  relationshipMemories,
  relationships,
} from "@/db/schema";
import { childLogger } from "@/lib/logger";
import { generateText } from "@/server/claude/client";
import { extractJsonObject } from "@/server/claude/json";
import { jaccard } from "@/server/claude/validators";

const log = childLogger("memory.extract");

type Extracted = {
  groupMemories?: string[];
  personaMemories?: { persona: string; content: string }[];
  relationshipMemories?: { between: [string, string]; content: string }[];
};

/**
 * After a private-simulation conversation finishes, distil durable, low-key facts
 * (who mentioned what) so later conversations feel continuous. Best effort; never throws.
 */
export async function extractMemoriesForSession(sessionId: string, groupId: string) {
  try {
    const msgs = await db
      .select({
        content: conversationMessages.content,
        personaId: conversationMessages.personaId,
        position: conversationMessages.position,
      })
      .from(conversationMessages)
      .where(
        and(eq(conversationMessages.sessionId, sessionId), eq(conversationMessages.status, "SENT")),
      )
      .orderBy(conversationMessages.position);
    if (msgs.length < 3) return;

    const ids = [...new Set(msgs.map((m) => m.personaId).filter((x): x is string => !!x))];
    const ps = await db.select().from(personas).where(inArray(personas.id, ids));
    const name = new Map(ps.map((p) => [p.id, p.name]));
    const transcript = msgs
      .map((m) => `${(m.personaId && name.get(m.personaId)) ?? "?"}: ${m.content}`)
      .join("\n");

    const res = await generateText({
      system:
        "You extract small, durable memories from a casual chat between fictional personas so later chats can refer back to them. Only record things explicitly said in the transcript. Never record claims about LakiPH, money, bonuses or winnings. Skip trivia. Output JSON only.",
      messages: [
        {
          role: "user",
          content: `Transcript:\n${transcript}\n\nReturn JSON: {"groupMemories":[up to 2 short strings about shared events/topics],"personaMemories":[up to 3 {"persona":"name","content":"personal fact they mentioned"}],"relationshipMemories":[up to 2 {"between":["name","name"],"content":"fact about the two of them"}]}. Use [] when nothing is worth remembering. Write memories in the language they were said (Taglish is fine), one short sentence each.`,
        },
      ],
      maxTokens: 1200,
      temperature: 0.2,
    });
    const data = extractJsonObject(res.text) as Extracted;
    const byName = new Map(ps.map((p) => [p.name.toLowerCase(), p.id]));

    const existingGroup = await db
      .select()
      .from(groupMemories)
      .where(eq(groupMemories.groupId, groupId));
    for (const content of (data.groupMemories ?? []).slice(0, 2)) {
      if (!content?.trim() || existingGroup.some((e) => jaccard(e.content, content) > 0.7))
        continue;
      await db.insert(groupMemories).values({
        groupId,
        content: content.trim().slice(0, 1000),
        importance: 2,
        sourceSessionId: sessionId,
      });
    }

    for (const m of (data.personaMemories ?? []).slice(0, 3)) {
      const personaId = byName.get(String(m.persona).toLowerCase());
      if (!personaId || !m.content?.trim()) continue;
      const existing = await db
        .select()
        .from(personaMemories)
        .where(eq(personaMemories.personaId, personaId));
      if (existing.some((e) => jaccard(e.content, m.content) > 0.7)) continue;
      await db.insert(personaMemories).values({
        personaId,
        content: m.content.trim().slice(0, 1000),
        importance: 2,
        sourceSessionId: sessionId,
      });
    }

    const rels = ids.length ? await db.select().from(relationships) : [];
    for (const m of (data.relationshipMemories ?? []).slice(0, 2)) {
      const [a, b] = (m.between ?? []).map((n) => byName.get(String(n).toLowerCase()));
      if (!a || !b || !m.content?.trim()) continue;
      const rel = rels.find(
        (r) =>
          (r.personaAId === a && r.personaBId === b) || (r.personaAId === b && r.personaBId === a),
      );
      if (!rel) continue;
      const existing = await db
        .select()
        .from(relationshipMemories)
        .where(eq(relationshipMemories.relationshipId, rel.id));
      if (existing.some((e) => jaccard(e.content, m.content) > 0.7)) continue;
      await db.insert(relationshipMemories).values({
        relationshipId: rel.id,
        content: m.content.trim().slice(0, 1000),
        importance: 2,
        sourceSessionId: sessionId,
      });
    }
    log.info({ sessionId }, "memories extracted");
  } catch (err) {
    log.warn({ sessionId, err: (err as Error).message }, "memory extraction failed");
  }
}
