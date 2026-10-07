import { TelegramClient } from "telegram";
import { LogLevel } from "telegram/extensions/Logger";
import { StringSession } from "telegram/sessions";
import { requireEnv } from "@/lib/env";
import { acquireLock, releaseLock, renewLock } from "@/server/queues/locks";
import { redisConfigured } from "@/server/queues/names";
import { TelegramServiceError } from "./errors";
import { childLogger } from "@/lib/logger";

const log = childLogger("telegram.client");

export function apiCredentials() {
  return { apiId: requireEnv("TELEGRAM_API_ID"), apiHash: requireEnv("TELEGRAM_API_HASH") };
}

function parseProxy(proxyUrl: string | null | undefined) {
  if (!proxyUrl) return undefined;
  try {
    const u = new URL(proxyUrl);
    return {
      socksType: 5 as const,
      ip: u.hostname,
      port: parseInt(u.port, 10),
      ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
      ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    };
  } catch {
    return undefined;
  }
}

export function createClient(sessionString = "", proxyUrl?: string | null): TelegramClient {
  const { apiId, apiHash } = apiCredentials();
  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 3,
    deviceModel: "Samsung Galaxy S23",
    systemVersion: "Android 14",
    appVersion: "10.14.4",
    langCode: "en",
    systemLangCode: "en",
    ...(proxyUrl ? { proxySettings: parseProxy(proxyUrl) } : {}),
  });
  // GramJS logs benign ping timeouts to the console; our own structured logs cover real failures.
  client.setLogLevel(LogLevel.NONE);
  return client;
}

export function exportSession(client: TelegramClient): string {
  return (client.session as StringSession).save();
}

/**
 * Pool of live clients keyed by account id (on globalThis so Next.js hot reloads do not leak
 * connections).
 *
 * Telegram invalidates a session that is used from two places at once, and the dashboard and the
 * worker are two processes. So when Redis is configured, a process must hold a per-account lock
 * while its client is connected, and it releases client + lock after IDLE_MS without use.
 */
type Entry = {
  client: TelegramClient;
  locked: boolean;
  ready?: Promise<void>;
  timer?: NodeJS.Timeout;
};

const g = globalThis as unknown as { __tgPool?: Map<string, Entry> };
const pool = (g.__tgPool ??= new Map());

const IDLE_MS = 45_000;
const LOCK_TTL_MS = 120_000;
const LOCK_WAIT_MS = 60_000;
const lockKey = (accountId: string) => `allyono:tg-session:${accountId}`;

function touch(accountId: string, entry: Entry) {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => void dropClient(accountId), IDLE_MS);
  entry.timer.unref?.();
  if (entry.locked) void renewLock(lockKey(accountId), LOCK_TTL_MS).catch(() => undefined);
}

export async function getConnectedClient(
  accountId: string,
  sessionString: string,
  proxyUrl?: string | null,
): Promise<TelegramClient> {
  let entry = pool.get(accountId);
  if (!entry) {
    entry = { client: createClient(sessionString, proxyUrl), locked: false };
    pool.set(accountId, entry);
  }
  const e = entry;
  // Concurrent callers in this process share one connect/lock attempt.
  e.ready ??= (async () => {
    if (redisConfigured() && !e.locked) {
      const ok = await acquireLock(lockKey(accountId), LOCK_TTL_MS, LOCK_WAIT_MS);
      if (!ok) {
        throw new TelegramServiceError(
          "This account is being used by another process. Try again in a minute.",
          "UNKNOWN",
        );
      }
      e.locked = true;
    }
    if (!e.client.connected) {
      await e.client.connect();
      log.info({ accountId }, "telegram client connected");
    }
  })().catch(async (err) => {
    await dropClient(accountId);
    throw err;
  });
  await e.ready;
  touch(accountId, e);
  return e.client;
}

/** Disconnects the client and releases the cross-process lock. */
export async function dropClient(accountId: string) {
  const entry = pool.get(accountId);
  if (!entry) return;
  pool.delete(accountId);
  if (entry.timer) clearTimeout(entry.timer);
  await entry.client.disconnect().catch(() => undefined);
  if (entry.locked) await releaseLock(lockKey(accountId)).catch(() => undefined);
}

/** Used on worker shutdown so session locks are released promptly. */
export async function releaseAllClients() {
  await Promise.all([...pool.keys()].map((id) => dropClient(id)));
}
