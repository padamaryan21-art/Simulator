import { generateText, LlmError } from "./client";
import { extractJsonObject } from "./json";
import type { ConversationContext } from "./contextBuilder";

const URL_RE = /(https?:\/\/|www\.|t\.me\/)/i;

/**
 * Regenerates ONE message in place, keeping the surrounding conversation intact.
 * Returns only the new message text.
 */
export async function regenerateMessage(
  ctx: ConversationContext,
  conversation: { speaker: string; text: string }[],
  index: number,
): Promise<string> {
  const target = conversation[index];
  const before = conversation.slice(0, index);
  const after = conversation.slice(index + 1);
  const fmt = (ms: typeof conversation) =>
    ms.length ? ms.map((m) => `${m.speaker}: ${m.text}`).join("\n") : "(none)";

  const user = [
    ctx.user,
    "# TASK: REPLACE ONE MESSAGE",
    `Messages before:\n${fmt(before)}`,
    `Messages after (keep consistent with these):\n${fmt(after)}`,
    `Rewrite ONLY ${target.speaker}'s message that currently says: "${target.text}"`,
    "Write a different version in the same voice that fits between the messages above.",
    'Return JSON exactly like {"text":"<new message>"} and nothing else.',
  ].join("\n\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateText({
      system: ctx.system,
      messages: [{ role: "user", content: user }],
      maxTokens: 800,
      temperature: 1,
    });
    try {
      const text = String((extractJsonObject(res.text) as { text?: unknown }).text ?? "").trim();
      if (text && text.length <= 600 && !URL_RE.test(text) && text !== target.text) return text;
    } catch {
      /* retry */
    }
  }
  throw new LlmError("Could not regenerate this message. Try again.");
}
