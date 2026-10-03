// Single entry point for text generation. The model pool (free-first) is configured via
// LLM_MODELS in the environment; nothing else in the app names a model.
export { generateText, getPool, LlmError } from "@/server/llm/client";
export type { GenerateResult } from "@/server/llm/client";
