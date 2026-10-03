import { z } from "zod";

/**
 * Core vars are required at startup. Integration vars (Claude, Telegram, Redis)
 * are optional here so the dashboard boots before those phases are configured;
 * each service calls `requireEnv()` when it actually needs one.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  /**
   * Model pool, comma-separated "provider:model" entries, tried in order (or rotated).
   * Entries whose provider has no API key are skipped. Empty = one default per keyed provider.
   * Example: groq:openai/gpt-oss-120b,openrouter:google/gemma-4-31b-it:free
   */
  LLM_MODELS: z.string().optional(),
  /** failover: always start at the top of the pool. rotate: spread requests round-robin. */
  LLM_STRATEGY: z.enum(["failover", "rotate"]).default("failover"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  CLAUDE_MODEL: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  CEREBRAS_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  MISTRAL_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  TELEGRAM_API_ID: z.coerce.number().int().positive().optional(),
  TELEGRAM_API_HASH: z.string().min(1).optional(),
  /** 32-byte key, base64 or 64-char hex. Encrypts Telegram sessions at rest. */
  SESSION_ENCRYPTION_KEY: z.string().min(32).optional(),
  REDIS_URL: z.string().min(1).optional(),
  /**
   * "true" = nothing is ever sent to Telegram: messages are marked sent after the normal plan,
   * delays and quota checks. For testing the scheduler safely.
   */
  SIMULATION_DRY_RUN: z.enum(["true", "false"]).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof serverSchema>;

export const isDryRun = () => process.env.SIMULATION_DRY_RUN === "true";

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  // Blank lines in .env files arrive as "" - treat them as unset.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const parsed = serverSchema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n  ${missing.join("\n  ")}`);
  }
  cached = parsed.data;
  return cached;
}

/** Get an optional integration variable or fail with a clear message. */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = getEnv()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `Environment variable ${String(key)} is required for this operation but is not set.`,
    );
  }
  return value as NonNullable<Env[K]>;
}
