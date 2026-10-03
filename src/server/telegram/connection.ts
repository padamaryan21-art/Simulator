import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramAccounts } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { childLogger } from "@/lib/logger";
import { getAccountRow, toPublicAccount } from "./accounts";
import { logoutAccount } from "./auth";
import { dropClient, getConnectedClient } from "./client";
import { TelegramServiceError, normalizeTelegramError } from "./errors";

const log = childLogger("telegram.connection");

/** Returns a connected client for an account, or throws a TelegramServiceError. */
export async function connectAccount(accountId: string) {
  const row = await getAccountRow(accountId);
  if (!row?.encryptedSession) {
    throw new TelegramServiceError("Account has no saved session", "NOT_AUTHORIZED");
  }
  return getConnectedClient(accountId, decryptSecret(row.encryptedSession));
}

/** Reconnect = drop the pooled client and build a fresh one from the saved session. */
export async function reconnectAccount(accountId: string) {
  await dropClient(accountId);
  return checkConnection(accountId);
}

export async function checkConnection(accountId: string) {
  try {
    const client = await connectAccount(accountId);
    const me = await client.getMe();
    const [row] = await db
      .update(telegramAccounts)
      .set({ status: "CONNECTED", lastError: null, lastCheckedAt: new Date() })
      .where(eq(telegramAccounts.id, accountId))
      .returning();
    log.info({ accountId }, "connection check ok");
    return {
      ok: true as const,
      telegramUsername: me.username ?? null,
      account: toPublicAccount(row),
    };
  } catch (err) {
    const e = normalizeTelegramError(err);
    const [row] = await db
      .update(telegramAccounts)
      .set({
        status: e.code === "NOT_AUTHORIZED" ? "DISCONNECTED" : "ERROR",
        lastError: e.message,
        lastCheckedAt: new Date(),
      })
      .where(eq(telegramAccounts.id, accountId))
      .returning();
    log.warn({ accountId, code: e.code }, "connection check failed");
    return { ok: false as const, error: e.message, account: row ? toPublicAccount(row) : null };
  }
}

export async function disconnectAccount(accountId: string) {
  const row = await getAccountRow(accountId);
  let client;
  if (row?.encryptedSession) client = await connectAccount(accountId).catch(() => undefined);
  await logoutAccount(accountId, client);
}
