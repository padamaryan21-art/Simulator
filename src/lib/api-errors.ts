import { HttpError } from "./api";
import { NotFoundError, RuleError } from "@/server/conversations/service";
import { ImageError } from "@/server/images/process";
import { LlmError } from "@/server/llm/client";
import { PromptError } from "@/server/prompts/service";
import { KnowledgeError } from "@/server/knowledge/service";

/** Maps domain errors from the conversation service to HTTP errors. */
export async function mapDomain<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RuleError) throw new HttpError(400, err.message);
    if (err instanceof NotFoundError) throw new HttpError(404, err.message);
    if (err instanceof ImageError) throw new HttpError(400, err.message);
    if (err instanceof PromptError) throw new HttpError(400, err.message);
    // AI provider problems (rate limit, no credit, unusable output) are service problems, not bugs.
    if (err instanceof LlmError) throw new HttpError(err.kind === "other" ? 502 : 503, err.message);
    throw err;
  }
}

/** Maps knowledge-service errors to HTTP errors. */
export async function mapKnowledge<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof KnowledgeError) throw new HttpError(400, err.message);
    if (err instanceof LlmError) throw new HttpError(err.kind === "other" ? 502 : 503, err.message);
    throw err;
  }
}
