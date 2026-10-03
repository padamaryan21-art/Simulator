import pino from "pino";

/** Structured logger. Secrets are redacted by path as a safety net; never log them on purpose. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password",
      "*.password",
      "apiKey",
      "*.apiKey",
      "session",
      "*.session",
      "sessionString",
      "*.sessionString",
      "encryptedSession",
      "*.encryptedSession",
      "code",
      "*.code",
      "phoneCode",
      "*.phoneCode",
      "authorization",
      "*.authorization",
    ],
    censor: "[REDACTED]",
  },
});

export const childLogger = (module: string) => logger.child({ module });
