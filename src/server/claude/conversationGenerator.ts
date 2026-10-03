import { childLogger } from "@/lib/logger";
import { generateText, LlmError } from "./client";
import type { ConversationContext } from "./contextBuilder";
import {
  SEVERE_CODES,
  parseConversationJson,
  validateConversation,
  type ValidationIssue,
  type ValidationResult,
} from "./validators";

const log = childLogger("conversation.generator");

export type GeneratedConversation = {
  messages: { speaker: string; text: string }[];
  /** Quality issues that remain after the automatic retry; surfaced to the reviewer. */
  warnings: ValidationIssue[];
  provider: string;
  model: string;
};

function validateAgainst(
  ctx: ConversationContext,
  raw: ReturnType<typeof parseConversationJson>,
): ValidationResult {
  return validateConversation(raw, {
    participants: ctx.participants.map((p) => p.name),
    recent: ctx.recentMessages.map((m) => m.text),
    topicCategory: ctx.topic?.category,
    factsText: ctx.facts
      .map((f) => f.fact)
      .join(" ")
      .replace(/\s/g, ""),
    expectedCount: ctx.messageCount,
  });
}

const score = (r: ValidationResult) =>
  r.issues.reduce((n, i) => n + (SEVERE_CODES.has(i.code) ? 3 : 1), 0) +
  (r.messages.length === 0 ? 100 : 0);

async function attempt(ctx: ConversationContext, feedback?: ValidationIssue[]) {
  const user = feedback?.length
    ? `${ctx.user}\n\nYour previous draft had these problems. Fix them in this new version:\n${[
        ...new Set(feedback.map((i) => `- ${i.message}`)),
      ].join("\n")}`
    : ctx.user;
  const res = await generateText({
    system: ctx.system,
    messages: [{ role: "user", content: user }],
    maxTokens: Math.min(6000, 800 + ctx.messageCount * 160),
    temperature: 0.95,
  });
  return { ...res, validated: validateAgainst(ctx, parseConversationJson(res.text)) };
}

/**
 * Generates a conversation, validates it, and retries once with the issues as feedback.
 * The better of the two drafts (fewest/least severe issues) is returned.
 */
export async function generateConversation(
  ctx: ConversationContext,
): Promise<GeneratedConversation> {
  // A quota/credit refusal will not improve on retry: surface it to the user as it is.
  const passThrough = (err: unknown) => {
    if (err instanceof LlmError && err.kind !== "other") throw err;
  };
  let best = await attempt(ctx).catch((err) => {
    passThrough(err);
    log.warn({ err: (err as Error).message }, "first attempt failed");
    return null;
  });

  if (!best || score(best.validated) > 0) {
    const retry = await attempt(ctx, best?.validated.issues).catch((err) => {
      if (!best) passThrough(err); // with a usable first draft, a failed retry is not fatal
      log.warn({ err: (err as Error).message }, "retry failed");
      return null;
    });
    if (retry && (!best || score(retry.validated) < score(best.validated))) best = retry;
  }
  if (!best || !best.validated.messages.length) {
    throw new LlmError(
      "The AI did not return a usable conversation. Try again or adjust the topic.",
    );
  }
  log.info(
    {
      provider: best.provider,
      model: best.model,
      messages: best.validated.messages.length,
      issues: best.validated.issues.length,
    },
    "conversation generated",
  );
  return {
    messages: best.validated.messages,
    warnings: best.validated.issues,
    provider: best.provider,
    model: best.model,
  };
}
