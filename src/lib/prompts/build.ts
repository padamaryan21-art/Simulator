/**
 * Builds the prompts you paste into ChatGPT (or another AI site) to write conversations that the
 * "Import conversations" page can read. Pure and shared by the server and the browser.
 *
 * One builder for every prompt keeps the output format, the quality bar and the safety rules
 * identical everywhere. A prompt's own part is only its topic and its list of situations.
 */

export type Situation = { label: string; detail: string };

export type PromptSpec = {
  title: string;
  topic: string;
  /** Distinct situations; conversations cycle through them so the whole set stays varied. */
  situations: Situation[];
  /** Extra topic-specific rules (optional). */
  notes?: string;
  conversations: number;
  linesMin: number;
  linesMax: number;
  /** How many conversations ChatGPT writes per reply. A reply has a length limit. */
  batchSize: number;
};

export type CastMember = {
  name: string;
  personality?: string;
  languageStyle?: string;
  occupation?: string;
  messageLength?: "SHORT" | "MEDIUM" | "LONG";
  commonExpressions?: string[];
};

const LENGTH_HINT = {
  SHORT: "usually very short messages",
  MEDIUM: "medium-length messages",
  LONG: "often longer messages",
} as const;

/** The smallest total ChatGPT must produce for this prompt to count. */
export const MIN_TOTAL_LINES = 2000;

export function promptStats(
  spec: Pick<PromptSpec, "conversations" | "linesMin" | "linesMax" | "batchSize">,
) {
  return {
    minLines: spec.conversations * spec.linesMin,
    maxLines: spec.conversations * spec.linesMax,
    batches: Math.ceil(spec.conversations / spec.batchSize),
  };
}

/** Why a spec cannot produce 2,000+ lines, or null when it can. Used to validate custom prompts. */
export function specProblem(spec: PromptSpec): string | null {
  if (spec.linesMin > spec.linesMax) return "Minimum lines per conversation is above the maximum.";
  if (spec.linesMax > 60) return "A conversation can have at most 60 lines.";
  if (!spec.situations.length) return "Add at least one situation.";
  if (promptStats(spec).minLines < MIN_TOTAL_LINES)
    return `This setting gives only ${promptStats(spec).minLines} lines at minimum. Raise the number of conversations or the lines per conversation to reach ${MIN_TOTAL_LINES}.`;
  return null;
}

/** Safety rules shared by every prompt. They mirror the checks the importer runs. */
export const SAFETY_RULES = [
  "No links, usernames, phone numbers or app names with URLs.",
  'Nobody mentions winning money, payouts, jackpots, cashouts, "lucky" games, betting tips or ways to beat any game.',
  "Nobody promotes anything, urges anyone to register, deposit, top up or play, or mentions bonuses, promos or referral rewards.",
  "No fake testimonials and no made-up facts, numbers, percentages or prices about any real company, game or product.",
  "No hate, harassment, politics, religion arguments, sexual content or self-harm. Teasing must stay friendly.",
  "Never claim to be an AI, never address the reader, and never add notes inside the chat lines.",
];

export function buildPrompt(spec: PromptSpec, cast: CastMember[]): string {
  const { minLines, maxLines, batches } = promptStats(spec);
  const first = Math.min(spec.batchSize, spec.conversations);
  const who = cast.length
    ? cast
        .map((p) => {
          const bits = [
            p.personality,
            p.occupation ? `Works as: ${p.occupation}.` : "",
            p.languageStyle ? `Style: ${p.languageStyle}` : "",
            p.messageLength ? `${LENGTH_HINT[p.messageLength]}.` : "",
            p.commonExpressions?.length ? `Often says: ${p.commonExpressions.join(", ")}.` : "",
          ]
            .map((s) => (s ?? "").trim())
            .filter(Boolean)
            .join(" ");
          return `- ${p.name}${bits ? `: ${bits}` : ""}`;
        })
        .join("\n")
    : "- (add personas first, then copy this prompt again)";
  const situations = spec.situations.map((s, i) => `${i + 1}. ${s.label}: ${s.detail}`).join("\n");
  const names = cast.map((c) => c.name).join(", ") || "the friends above";

  return `You are writing realistic group-chat conversations in natural Filipino (Tagalog / Taglish) for a private friends' group chat. Topic of this set: "${spec.topic}".

CAST (use only these names, spelled exactly like this):
${who}

SIZE OF THE JOB
- ${spec.conversations} separate conversations in total, numbered 1 to ${spec.conversations}.
- Each conversation has ${spec.linesMin} to ${spec.linesMax} messages, so the full set is about ${minLines.toLocaleString()} to ${maxLines.toLocaleString()} lines.
- A single reply cannot hold that much, so you will work in ${batches} batches of ${spec.batchSize} conversations (the last batch may be smaller).

SITUATIONS (conversation number n uses situation ((n - 1) mod ${spec.situations.length}) + 1)
${situations}
When a situation comes around again, change the angle: a different mood, a different detail, a different person starting it, a different ending. No two conversations may open with the same line or follow the same pattern.

HOW IT SHOULD READ
- It must sound like real friends texting, not a script: short reactions ("hahaha", "grabe", "true", "ay oo nga"), half-finished thoughts, teasing, tangents that come back, questions that get answered a few lines later, and replies that refer to what was said earlier.
- Keep each person's personality and way of speaking consistent with the cast list above.
- Mix message lengths: many short ones, some medium, a few longer ones. Never more than 200 characters in one message. Emojis are fine but not in every line.
- Each conversation has 2 to 5 speakers out of ${names}. Not everyone speaks every time. The same person may send two messages in a row sometimes, but never more than two.
- Stay on the situation, but let it drift naturally the way real chats do. End each conversation naturally (someone has to go, a joke, "sige mamaya"), never with a summary or a moral.
- Use everyday Filipino life: real places, food, weather, work and family details that anyone could say. Do not invent facts about real companies or products.
${spec.notes ? `- ${spec.notes}\n` : ""}
SAFETY RULES (a conversation that breaks any of these is rejected, rewrite it)
${SAFETY_RULES.map((r) => `- ${r}`).join("\n")}

OUTPUT FORMAT (the importer reads exactly this)
- Reply with ONE code block of CSV and nothing else: no greeting, no explanation, no summary.
- Columns, in this order: conversation,topic,speaker,message
- "conversation" is the conversation number (1, 2, 3, ...). All lines of a conversation share it and stay in order.
- "topic" is the short label of that conversation's situation.
- "speaker" is exactly one name from the cast.
- "message" is wrapped in double quotes. A double quote inside a message is written twice (""). A message is a single line with no line breaks.
- Put the header row (conversation,topic,speaker,message) ONLY in the first batch. Later batches continue with data rows only, so I can paste all batches into one file.

HOW WE WORK
1. Write batch 1 now: conversations 1 to ${first}.
2. Then stop. I will reply "continue" and you write the next ${spec.batchSize} conversations, continuing the numbering exactly (no repeats, no gaps).
3. After conversation ${spec.conversations}, reply only: DONE
4. Length is checked strictly. Every conversation must have AT LEAST ${spec.linesMin} lines (aim for about ${Math.round((spec.linesMin + spec.linesMax) / 2)}), and every batch must contain exactly ${spec.batchSize} conversations (fewer only in the last batch). Count the lines of each conversation before you answer; if one is short, add more natural lines to it. Never stop early, never shorten to fit, never write "and so on".
5. Before each batch, silently check: right conversation numbers, every line has a cast name, no message over 200 characters, no rule above broken.

Start now with batch 1.`;
}

/** What to type between batches. */
export const CONTINUE_MESSAGE = "continue";

/** If ChatGPT stops early or loses the numbering, this brings it back on track. */
export function resumeMessage(
  nextConversation: number,
  spec: Pick<PromptSpec, "batchSize" | "conversations" | "linesMin" | "linesMax">,
) {
  const last = Math.min(spec.conversations, nextConversation + spec.batchSize - 1);
  return `Continue with conversations ${nextConversation} to ${last}. Same format: ONE code block of CSV, data rows only (no header), ${spec.linesMin} to ${spec.linesMax} lines per conversation, same cast and rules.`;
}
