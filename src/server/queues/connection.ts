import IORedis, { type RedisOptions } from "ioredis";
import { requireEnv } from "@/lib/env";
import { childLogger } from "@/lib/logger";

const log = childLogger("redis");

/**
 * Redis connections are scarce on the free Redis Cloud plan (30 max), so the app shares:
 *  - one connection for all Queue producers + locks/rate-limit helpers (`getSharedConnection`)
 *  - one dedicated connection per Worker (BullMQ requires this for blocking reads)
 */
export function redisOptions(): RedisOptions {
  const url = new URL(requireEnv("REDIS_URL"));
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username || "default"),
    password: decodeURIComponent(url.password),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    // Required by BullMQ so blocking commands are not aborted.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 15_000,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
  };
}

export function createRedisConnection(label: string): IORedis {
  const conn = new IORedis(redisOptions());
  conn.on("error", (err) => log.warn({ label, err: err.message }, "redis connection error"));
  conn.on("ready", () => log.debug({ label }, "redis ready"));
  return conn;
}

/** Process-wide shared connection (kept on globalThis to survive Next.js hot reloads). */
const g = globalThis as unknown as { __redisShared?: IORedis };

export function getSharedConnection(): IORedis {
  return (g.__redisShared ??= createRedisConnection("shared"));
}

export async function closeSharedConnection() {
  if (g.__redisShared) {
    await g.__redisShared.quit().catch(() => undefined);
    g.__redisShared = undefined;
  }
}
