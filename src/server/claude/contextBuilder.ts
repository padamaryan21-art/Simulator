import { and, desc, eq, inArray, ne, notInArray } from "drizzle-orm";
import { db } from "@/db";
import {
  conversationMessages,
  conversationSessions,
  groupMemories,
  groups,
  personaMemories,
  personas,
  relationshipMemories,
  relationships,
  topicCategories,
} from "@/db/schema";
import { getConfirmedFacts, type KnowledgeFact } from "@/server/knowledge/retrieve";
import { getTopic, type Topic } from "@/server/conversations/topics";
import { CONVERSATION_RULES, OUTPUT_FORMAT, SYSTEM_RULES } from "./prompts";

type PersonaRow = typeof personas.$inferSelect;

export type ContextData = {
  environment: "PRIVATE_SIMULATION" | "REAL_COMMUNITY";
  groupName: string;
  participants: PersonaRow[];
  relationships: {
    a: string;
    b: string;
    type: string;
    familiarity: number;
    tone: string;
    notes: string;
  }[];
  personaMemories: { persona: string; content: string }[];
  relationshipMemories: { between: string; content: string }[];
  groupMemories: string[];
  recentMessages: { speaker: string; text: string }[];
  topic: { title: string; category?: string; description: string; seed: string } | null;
  facts: KnowledgeFact[];
  now: Date;
  messageCount: number;
  instruction?: string;
};

export type ConversationContext = ContextData & { system: string; user: string };

const PH_TZ = "Asia/Manila";

export function describeEnvironment(now: Date) {
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-PH", { timeZone: PH_TZ, ...o }).format(now);
  const hour = Number(fmt({ hour: "numeric", hour12: false })) % 24;
  const part =
    hour < 5
      ? "madaling-araw"
      : hour < 12
        ? "umaga"
        : hour < 18
          ? "hapon"
          : hour < 22
            ? "gabi"
            : "late night";
  const weekday = fmt({ weekday: "long" });
  const weekend = ["Saturday", "Sunday"].includes(weekday);
  return `${fmt({ dateStyle: "full" })}, ${part} (${fmt({ timeStyle: "short" })} Philippine time). ${weekend ? "Weekend." : "Weekday."}`;
}

const bullet = (items: string[]) =>
  items.length ? items.map((i) => `- ${i}`).join("\n") : "- (none)";
const list = (a: string[]) => (a.length ? a.join(", ") : "—");

function personaBlock(p: PersonaRow): string {
  return [
    `## ${p.name}`,
    `Personality: ${p.personality || "—"}`,
    `Background: ${p.background || "—"}`,
    `Occupation: ${p.occupation || "—"}`,
    `Interests: ${list(p.interests)} | Hobbies: ${list(p.hobbies)}`,
    `Likes: ${list(p.likes)} | Dislikes: ${list(p.dislikes)}`,
    `Language style: ${p.languageStyle || "—"}`,
    `Language mix (0-100): Tagalog ${p.tagalogLevel}, English ${p.englishLevel}, Taglish ${p.taglishLevel}`,
    `Emoji frequency ${p.emojiFrequency}/100, slang ${p.slangLevel}/100, typical message length: ${p.messageLength.toLowerCase()}`,
    `Common expressions: ${list(p.commonExpressions)}`,
    `Behavior rules: ${list(p.behaviorRules)}`,
  ].join("\n");
}

/** Pure formatter: turns loaded data into the structured prompt sections. */
export function formatContext(d: ContextData): ConversationContext {
  const names = d.participants.map((p) => p.name);
  const knowledge = d.facts.length
    ? `Confirmed facts (the ONLY facts you may state about AllYono; each is from the official site):\n${bullet(d.facts.map((f) => f.fact))}\nAnything not listed is UNKNOWN: do not state or guess it.`
    : "No confirmed facts are available. Treat everything about AllYono as UNKNOWN: do not state or guess any details.";

  const user = [
    "# PERSONAS",
    `Participants (use these exact names as "speaker"): ${names.join(", ")}`,
    d.participants.map(personaBlock).join("\n\n"),
    "# RELATIONSHIPS",
    bullet(
      d.relationships.map(
        (r) =>
          `${r.a} & ${r.b}: ${r.type}, familiarity ${r.familiarity}/100, tone ${r.tone}.${r.notes ? ` ${r.notes}` : ""}`,
      ),
    ),
    "# PERSONA MEMORY",
    bullet(d.personaMemories.map((m) => `${m.persona}: ${m.content}`)),
    "# RELATIONSHIP MEMORY",
    bullet(d.relationshipMemories.map((m) => `${m.between}: ${m.content}`)),
    "# GROUP MEMORY",
    bullet(d.groupMemories),
    "# RECENT MESSAGES (most recent last; do not repeat their phrasing)",
    d.recentMessages.length
      ? d.recentMessages.map((m) => `${m.speaker}: ${m.text}`).join("\n")
      : "(none yet)",
    "# CURRENT TOPIC",
    d.topic
      ? `${d.topic.title}${d.topic.category ? ` [${d.topic.category}]` : ""}\n${d.topic.description}\n${d.topic.seed}`
      : "Free conversation: pick something ordinary and natural.",
    "# DAILY ENVIRONMENT",
    describeEnvironment(d.now),
    "# ALLYONO KNOWLEDGE",
    knowledge,
    "# CONVERSATION RULES",
    CONVERSATION_RULES,
    d.instruction ? `Additional instruction from the operator: ${d.instruction}` : "",
    `Write about ${d.messageCount} messages (a little fewer or more is fine).`,
    OUTPUT_FORMAT,
  ]
    .filter((s) => s !== "")
    .join("\n\n");

  return { ...d, system: SYSTEM_RULES, user };
}

export type BuildInput = {
  groupId: string;
  participantIds: string[];
  topicId?: string | null;
  messageCount: number;
  instruction?: string;
  /** Exclude this session's own messages from "recent messages". */
  excludeSessionId?: string;
  /** Also treat unsent drafts as recent history (used by bulk runs to avoid repetition). */
  includeUnsent?: boolean;
};

const take = <T>(arr: T[], n: number) => arr.slice(0, n);

/** Loads everything the model needs from the database. */
export async function buildConversationContext(input: BuildInput): Promise<ConversationContext> {
  const [group] = await db.select().from(groups).where(eq(groups.id, input.groupId));
  if (!group) throw new Error("Group not found");

  const participants = await db
    .select()
    .from(personas)
    .where(inArray(personas.id, input.participantIds));
  const ids = participants.map((p) => p.id);
  const nameOf = new Map(participants.map((p) => [p.id, p.name]));

  const rels = (await db.select().from(relationships).where(eq(relationships.active, true))).filter(
    (r) => ids.includes(r.personaAId) && ids.includes(r.personaBId),
  );
  const relIds = rels.map((r) => r.id);
  const relLabel = new Map(
    rels.map((r) => [r.id, `${nameOf.get(r.personaAId)} & ${nameOf.get(r.personaBId)}`]),
  );

  const [pMem, rMem, gMem] = await Promise.all([
    ids.length
      ? db
          .select()
          .from(personaMemories)
          .where(inArray(personaMemories.personaId, ids))
          .orderBy(desc(personaMemories.importance), desc(personaMemories.createdAt))
      : [],
    relIds.length
      ? db
          .select()
          .from(relationshipMemories)
          .where(inArray(relationshipMemories.relationshipId, relIds))
          .orderBy(desc(relationshipMemories.importance), desc(relationshipMemories.createdAt))
      : [],
    db
      .select()
      .from(groupMemories)
      .where(eq(groupMemories.groupId, group.id))
      .orderBy(desc(groupMemories.importance), desc(groupMemories.createdAt)),
  ]);

  const recentRows = await db
    .select({
      text: conversationMessages.content,
      personaId: conversationMessages.personaId,
    })
    .from(conversationMessages)
    .innerJoin(conversationSessions, eq(conversationMessages.sessionId, conversationSessions.id))
    .where(
      and(
        eq(conversationSessions.groupId, group.id),
        input.includeUnsent
          ? notInArray(conversationMessages.status, ["SKIPPED", "CANCELLED", "FAILED"])
          : eq(conversationMessages.status, "SENT"),
        input.excludeSessionId ? ne(conversationSessions.id, input.excludeSessionId) : undefined,
      ),
    )
    .orderBy(desc(conversationMessages.createdAt), desc(conversationMessages.position))
    .limit(input.includeUnsent ? 25 : 15);
  const speakerIds = [
    ...new Set(recentRows.map((r) => r.personaId).filter((x): x is string => !!x)),
  ];
  const speakers = speakerIds.length
    ? await db
        .select({ id: personas.id, name: personas.name })
        .from(personas)
        .where(inArray(personas.id, speakerIds))
    : [];
  const speakerName = new Map(speakers.map((s) => [s.id, s.name]));

  const topicRow: Topic | null = input.topicId ? await getTopic(input.topicId) : null;
  let categoryKey: string | undefined;
  if (topicRow) {
    const [c] = await db
      .select()
      .from(topicCategories)
      .where(eq(topicCategories.id, topicRow.categoryId));
    categoryKey = c?.key;
  }

  // AllYono facts are only offered when the topic is about AllYono, so it isn't mentioned constantly.
  const facts = categoryKey === "ALLYONO" ? await getConfirmedFacts() : [];

  return formatContext({
    environment: group.type,
    groupName: group.name,
    participants,
    relationships: rels.map((r) => ({
      a: nameOf.get(r.personaAId) ?? "?",
      b: nameOf.get(r.personaBId) ?? "?",
      type: r.relationshipType,
      familiarity: r.familiarity,
      tone: r.tone,
      notes: r.notes,
    })),
    personaMemories: take(pMem, 10).map((m) => ({
      persona: nameOf.get(m.personaId) ?? "?",
      content: m.content,
    })),
    relationshipMemories: take(rMem, 8).map((m) => ({
      between: relLabel.get(m.relationshipId) ?? "?",
      content: m.content,
    })),
    groupMemories: take(gMem, 8).map((m) => m.content),
    recentMessages: recentRows.reverse().map((r) => ({
      speaker: (r.personaId && speakerName.get(r.personaId)) || "Member",
      text: r.text,
    })),
    topic: topicRow
      ? {
          title: topicRow.title,
          category: categoryKey,
          description: topicRow.description,
          seed: topicRow.promptSeed,
        }
      : null,
    facts,
    now: new Date(),
    messageCount: input.messageCount,
    instruction: input.instruction,
  });
}
