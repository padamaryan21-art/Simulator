import { Api, type TelegramClient } from "telegram";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramAccounts } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { childLogger } from "@/lib/logger";
import { apiCredentials, createClient, dropClient, exportSession } from "./client";
import { TelegramServiceError, normalizeTelegramError } from "./errors";

const log = childLogger("telegram.auth");

type Pending = { client: TelegramClient; phone: string; phoneCodeHash: string; startedAt: number };

/**
 * In-progress logins live in process memory (the login code is never persisted).
 * This assumes a single Next.js server process, which matches the dashboard use case.
 */
const g = globalThis as unknown as { __tgPending?: Map<string, Pending> };
const pending = (g.__tgPending ??= new Map());
const PENDING_TTL_MS = 10 * 60 * 1000;

async function setStatus(
  accountId: string,
  status: (typeof telegramAccounts.$inferSelect)["status"],
  lastError: string | null = null,
) {
  await db
    .update(telegramAccounts)
    .set({ status, lastError, lastCheckedAt: new Date() })
    .where(eq(telegramAccounts.id, accountId));
}

async function discardPending(accountId: string) {
  const p = pending.get(accountId);
  pending.delete(accountId);
  if (p) await p.client.disconnect().catch(() => undefined);
}

export async function sendLoginCode(accountId: string, phone: string) {
  await discardPending(accountId);
  const [row] = await db
    .select({ proxyUrl: telegramAccounts.proxyUrl })
    .from(telegramAccounts)
    .where(eq(telegramAccounts.id, accountId));
  const client = createClient("", row?.proxyUrl);
  try {
    await client.connect();
    const { phoneCodeHash } = await client.sendCode(apiCredentials(), phone);
    pending.set(accountId, { client, phone, phoneCodeHash, startedAt: Date.now() });
    await db
      .update(telegramAccounts)
      .set({ phone, status: "AWAITING_CODE", lastError: null })
      .where(eq(telegramAccounts.id, accountId));
    log.info({ accountId }, "login code requested");
  } catch (err) {
    await client.disconnect().catch(() => undefined);
    const e = normalizeTelegramError(err);
    await setStatus(accountId, "ERROR", e.message);
    log.warn({ accountId, code: e.code }, "send code failed");
    throw e;
  }
}

function getPending(accountId: string): Pending {
  const p = pending.get(accountId);
  if (!p || Date.now() - p.startedAt > PENDING_TTL_MS) {
    pending.delete(accountId);
    throw new TelegramServiceError("No pending login; request a new code", "NO_PENDING_LOGIN");
  }
  return p;
}

async function finishLogin(accountId: string, p: Pending) {
  const encrypted = encryptSecret(exportSession(p.client));
  await db
    .update(telegramAccounts)
    .set({
      encryptedSession: encrypted,
      status: "CONNECTED",
      lastError: null,
      lastCheckedAt: new Date(),
    })
    .where(eq(telegramAccounts.id, accountId));
  pending.delete(accountId);
  // Drop the login client; runtime clients are rebuilt from the encrypted session.
  await p.client.disconnect().catch(() => undefined);
  log.info({ accountId }, "account connected");
}

/** Returns "CONNECTED" or "PASSWORD_REQUIRED" (2FA enabled). */
export async function verifyLoginCode(accountId: string, code: string) {
  const p = getPending(accountId);
  try {
    await p.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: p.phone,
        phoneCodeHash: p.phoneCodeHash,
        phoneCode: code,
      }),
    );
    await finishLogin(accountId, p);
    return "CONNECTED" as const;
  } catch (err) {
    const e = normalizeTelegramError(err);
    if (e.code === "PASSWORD_REQUIRED") {
      await setStatus(accountId, "AWAITING_PASSWORD");
      return "PASSWORD_REQUIRED" as const;
    }
    if (e.code === "CODE_EXPIRED") await discardPending(accountId);
    await setStatus(accountId, e.code === "INVALID_CODE" ? "AWAITING_CODE" : "ERROR", e.message);
    log.warn({ accountId, code: e.code }, "verify code failed");
    throw e;
  }
}

export async function verifyLoginPassword(accountId: string, password: string) {
  const p = getPending(accountId);
  try {
    await p.client.signInWithPassword(apiCredentials(), {
      password: async () => password,
      onError: async (e) => {
        throw e;
      },
    });
    await finishLogin(accountId, p);
  } catch (err) {
    const e = normalizeTelegramError(err);
    await setStatus(
      accountId,
      e.code === "INVALID_PASSWORD" ? "AWAITING_PASSWORD" : "ERROR",
      e.message,
    );
    log.warn({ accountId, code: e.code }, "verify password failed");
    throw e;
  }
}

export async function cancelLogin(accountId: string) {
  await discardPending(accountId);
}

export async function logoutAccount(accountId: string, sessionClient?: TelegramClient) {
  // Best effort: revoke the session on Telegram's side too.
  if (sessionClient) await sessionClient.invoke(new Api.auth.LogOut()).catch(() => undefined);
  await dropClient(accountId);
  await discardPending(accountId);
  await db
    .update(telegramAccounts)
    .set({ encryptedSession: null, status: "DISCONNECTED", lastError: null })
    .where(eq(telegramAccounts.id, accountId));
  log.info({ accountId }, "account disconnected");
}
