import { getEnv, type Env } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import { classifyFailure, cooldownFor, describeFailure, type FailureKind } from "./limits";

const log = childLogger("llm");

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type GenerateOptions = {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider for a JSON object response where supported. */
  json?: boolean;
  /** Only use pool entries from this provider (still fails over within it). */
  provider?: string;
  /** Only use this exact model (requires it to be in the pool). */
  model?: string;
};

export type PoolEntry = { provider: string; model: string };
export type GenerateResult = { text: string; provider: string; model: string };

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
    public readonly kind: FailureKind = "other",
    public readonly cooldownMs = 60_000,
  ) {
    super(message);
  }
}

/** OpenAI-compatible providers. Adding another free provider = one line + one env key. */
const OPENAI_COMPATIBLE: Record<
  string,
  {
    url: string;
    keyEnv: keyof Env;
    defaultModel: string;
    extraHeaders?: () => Record<string, string>;
  }
> = {
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
    defaultModel: "openai/gpt-oss-120b",
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    keyEnv: "OPENROUTER_API_KEY",
    defaultModel: "google/gemma-4-31b-it:free",
    extraHeaders: () => ({
      "HTTP-Referer": getEnv().NEXT_PUBLIC_APP_URL,
      "X-Title": "LakiPH Simulation",
    }),
  },
  cerebras: {
    url: "https://api.cerebras.ai/v1/chat/completions",
    keyEnv: "CEREBRAS_API_KEY",
    defaultModel: "gpt-oss-120b",
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
  },
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    keyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
  },
  mistral: {
    url: "https://api.mistral.ai/v1/chat/completions",
    keyEnv: "MISTRAL_API_KEY",
    defaultModel: "mistral-small-latest",
  },
};

export const KNOWN_PROVIDERS = [...Object.keys(OPENAI_COMPATIBLE), "anthropic"];

/** Providers that bill per use. Never part of the default pool; always tried after free ones. */
export const PAID_PROVIDERS = new Set(["openai", "anthropic"]);
export const isFreeProvider = (provider: string) => !PAID_PROVIDERS.has(provider);

function providerKey(provider: string): string | undefined {
  const env = getEnv();
  if (provider === "anthropic") return env.ANTHROPIC_API_KEY;
  const cfg = OPENAI_COMPATIBLE[provider];
  return cfg ? (env[cfg.keyEnv] as string | undefined) : undefined;
}

function parsePool(raw: string | undefined): PoolEntry[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const i = entry.indexOf(":");
      if (i < 1) return [];
      return [{ provider: entry.slice(0, i).toLowerCase(), model: entry.slice(i + 1) }];
    });
}

/** The usable pool: configured entries whose provider has a key, in order. */
export function getPool(onlyProvider?: string, onlyModel?: string): PoolEntry[] {
  const env = getEnv();
  let pool = parsePool(env.LLM_MODELS);
  if (!pool.length) {
    // Default pool is free-tier providers only.
    pool = Object.entries(OPENAI_COMPATIBLE)
      .filter(([provider]) => isFreeProvider(provider))
      .map(([provider, c]) => ({ provider, model: c.defaultModel }));
  }
  const usable = pool.filter(
    (e) =>
      KNOWN_PROVIDERS.includes(e.provider) &&
      providerKey(e.provider) &&
      (!onlyProvider || e.provider === onlyProvider) &&
      (!onlyModel || e.model === onlyModel),
  );
  // Free models first, paid ones strictly as a last resort (stable within each group).
  return [
    ...usable.filter((e) => isFreeProvider(e.provider)),
    ...usable.filter((e) => !isFreeProvider(e.provider)),
  ];
}

async function callOpenAiCompatible(entry: PoolEntry, o: GenerateOptions): Promise<string> {
  const cfg = OPENAI_COMPATIBLE[entry.provider];
  const body: Record<string, unknown> = {
    model: entry.model,
    messages: [{ role: "system", content: o.system }, ...o.messages],
    // Reasoning models spend part of this budget on hidden reasoning, so keep it generous.
    temperature: o.temperature ?? 0.9,
  };
  // OpenAI's newer models reject `max_tokens` in favour of `max_completion_tokens`.
  body[entry.provider === "openai" ? "max_completion_tokens" : "max_tokens"] = o.maxTokens ?? 4000;
  if (o.json) body.response_format = { type: "json_object" };
  if (/gpt-oss/.test(entry.model) && entry.provider !== "openrouter") body.reasoning_effort = "low";

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerKey(entry.provider)}`,
      "Content-Type": "application/json",
      ...cfg.extraHeaders?.(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.[0]?.error?.message ?? `HTTP ${res.status}`;
    throw failure(entry.provider, res.status, msg, Number(res.headers.get("retry-after")) || null);
  }
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text?.trim()) throw new LlmError(`${entry.provider}: empty response`, res.status, true);
  return text;
}

async function callAnthropic(entry: PoolEntry, o: GenerateOptions): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": providerKey("anthropic")!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: entry.model,
      system: o.system,
      messages: o.messages,
      max_tokens: o.maxTokens ?? 4000,
      temperature: o.temperature ?? 0.9,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? `HTTP ${res.status}`;
    throw failure("anthropic", res.status, msg, Number(res.headers.get("retry-after")) || null);
  }
  const text = (data?.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  if (!text.trim()) throw new LlmError("anthropic: empty response", res.status, true);
  return text;
}

/** Builds an LlmError that knows whether retrying makes sense and how long to back off. */
function failure(provider: string, status: number, message: string, retryAfterSec: number | null) {
  const kind = classifyFailure(status, message);
  const cooldownMs = cooldownFor(kind, message, retryAfterSec);
  // Rate limits and missing credit will not clear within this request: do not retry them.
  const retryable = kind === "other" && (status >= 500 || status === 408);
  return new LlmError(`${provider}: ${message}`, status, retryable, kind, cooldownMs);
}

const callEntry = (entry: PoolEntry, o: GenerateOptions) =>
  entry.provider === "anthropic" ? callAnthropic(entry, o) : callOpenAiCompatible(entry, o);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Models that failed recently are skipped until their cooldown ends (cheap circuit breaker). */
const cooldown = new Map<string, number>();
/** The latest failure per model, used to explain to the user why nothing is available. */
const lastFailure = new Map<
  string,
  { provider: string; kind: FailureKind; message: string; cooldownMs: number }
>();
let rotation = 0;
const keyOf = (e: PoolEntry) => `${e.provider}:${e.model}`;

function orderPool(pool: PoolEntry[]): PoolEntry[] {
  let ordered = pool;
  if (getEnv().LLM_STRATEGY === "rotate" && pool.length > 1) {
    const start = rotation++ % pool.length;
    ordered = [...pool.slice(start), ...pool.slice(0, start)];
  }
  // Free models first, paid strictly last.
  return [
    ...ordered.filter((e) => isFreeProvider(e.provider)),
    ...ordered.filter((e) => !isFreeProvider(e.provider)),
  ];
}

function unavailableError(pool: PoolEntry[]): LlmError {
  const reasons = pool
    .map((e) => lastFailure.get(keyOf(e)))
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .map((f) => `${f.provider}: ${describeFailure(f.kind, f.message, f.cooldownMs)}`);
  const unique = [...new Set(reasons)];
  return new LlmError(
    `All AI models are unavailable right now (${unique.join("; ") || "unknown reason"}). Wait a few minutes, add another provider key, or add credits.`,
    429,
    false,
    "rate_limit",
  );
}

/**
 * Generate text from the model pool: retry a transient failure once, then move to the next
 * pool entry. Prompts and outputs are never logged.
 */
export async function generateText(o: GenerateOptions): Promise<GenerateResult> {
  const pool = getPool(o.provider, o.model);
  if (!pool.length) {
    throw new LlmError("No LLM configured. Add an API key (e.g. GROQ_API_KEY) to .env.local.");
  }
  const now = Date.now();
  const ordered = orderPool(pool);
  const available = ordered.filter((e) => (cooldown.get(keyOf(e)) ?? 0) <= now);
  // Everything is cooling down: say so immediately instead of hammering providers that just refused.
  if (!available.length) throw unavailableError(ordered);

  let lastError: unknown;
  let sawOther = false;
  for (const entry of available) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await callEntry(entry, o);
        cooldown.delete(keyOf(entry));
        lastFailure.delete(keyOf(entry));
        log.info({ provider: entry.provider, model: entry.model }, "llm generation ok");
        return { text, ...entry };
      } catch (err) {
        lastError = err;
        const e = err instanceof LlmError ? err : null;
        const retryable = e ? e.retryable : true;
        if (!e || e.kind === "other") sawOther = true;
        const ms = e?.cooldownMs ?? 60_000;
        lastFailure.set(keyOf(entry), {
          provider: entry.provider,
          kind: e?.kind ?? "other",
          message: (err as Error).message,
          cooldownMs: ms,
        });
        cooldown.set(keyOf(entry), Date.now() + ms);
        log.warn(
          {
            ...entry,
            attempt,
            kind: e?.kind ?? "other",
            cooldownSec: Math.round(ms / 1000),
            err: (err as Error).message.slice(0, 200),
          },
          "llm generation failed",
        );
        if (!retryable) break;
        if (attempt === 0) await sleep(1200);
      }
    }
  }
  // Every model refused for quota/credit reasons: give the user one clear explanation.
  if (!sawOther) throw unavailableError(ordered);
  throw lastError instanceof Error ? lastError : new LlmError("LLM generation failed");
}
