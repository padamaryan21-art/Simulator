/** Normalises GramJS/MTProto errors into something safe to log and show. */
export class TelegramServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "FLOOD_WAIT"
      | "INVALID_CODE"
      | "CODE_EXPIRED"
      | "INVALID_PHONE"
      | "PASSWORD_REQUIRED"
      | "INVALID_PASSWORD"
      | "NOT_AUTHORIZED"
      | "NO_PENDING_LOGIN"
      | "UNKNOWN",
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export function normalizeTelegramError(err: unknown): TelegramServiceError {
  if (err instanceof TelegramServiceError) return err;
  const e = err as { errorMessage?: string; seconds?: number; message?: string };
  const m = e.errorMessage ?? e.message ?? "";
  if (m.startsWith("FLOOD") || typeof e.seconds === "number") {
    const secs = e.seconds ?? Number(/(\d+)/.exec(m)?.[1] ?? 60);
    return new TelegramServiceError(`Telegram rate limit: wait ${secs}s`, "FLOOD_WAIT", secs);
  }
  switch (true) {
    case m.includes("PHONE_CODE_INVALID"):
      return new TelegramServiceError("Invalid login code", "INVALID_CODE");
    case m.includes("PHONE_CODE_EXPIRED"):
      return new TelegramServiceError("Login code expired; request a new one", "CODE_EXPIRED");
    case m.includes("PHONE_NUMBER_INVALID"):
      return new TelegramServiceError("Invalid phone number", "INVALID_PHONE");
    case m.includes("SESSION_PASSWORD_NEEDED"):
      return new TelegramServiceError(
        "Two-step verification password required",
        "PASSWORD_REQUIRED",
      );
    case m.includes("PASSWORD_HASH_INVALID"):
      return new TelegramServiceError(
        "Incorrect two-step verification password",
        "INVALID_PASSWORD",
      );
    case m.includes("USER_DEACTIVATED"):
      return new TelegramServiceError("Account has been banned or deactivated by Telegram", "NOT_AUTHORIZED");
    case m.includes("AUTH_KEY") || m.includes("SESSION_REVOKED"):
      return new TelegramServiceError("Session is no longer authorized", "NOT_AUTHORIZED");
    default:
      return new TelegramServiceError(m || "Unknown Telegram error", "UNKNOWN");
  }
}
