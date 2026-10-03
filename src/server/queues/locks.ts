import { randomUUID } from "node:crypto";
import { getSharedConnection } from "./connection";

/** Identifies this OS process; a lock is owned by the process, not by one caller. */
export const PROCESS_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
const RENEW = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`;

/** Acquires `key` for this process, waiting up to `waitMs`. Re-entrant for the same process. */
export async function acquireLock(key: string, ttlMs: number, waitMs: number): Promise<boolean> {
  const redis = getSharedConnection();
  const deadline = Date.now() + waitMs;
  for (;;) {
    const ok = await redis.set(key, PROCESS_ID, "PX", ttlMs, "NX");
    if (ok === "OK") return true;
    if ((await redis.get(key)) === PROCESS_ID) {
      await redis.pexpire(key, ttlMs);
      return true;
    }
    if (Date.now() >= deadline) return false;
    await sleep(500);
  }
}

export async function renewLock(key: string, ttlMs: number) {
  await getSharedConnection().eval(RENEW, 1, key, PROCESS_ID, String(ttlMs));
}

export async function releaseLock(key: string) {
  await getSharedConnection().eval(RELEASE, 1, key, PROCESS_ID);
}

/**
 * Per-account pacing across ALL sessions and processes: waits until at least `gapMs` has passed
 * since the account last sent. Returns false if `shouldAbort()` fired while waiting.
 */
export async function waitForAccountSlot(
  accountId: string,
  gapMs: number,
  shouldAbort: () => Promise<boolean>,
): Promise<boolean> {
  const redis = getSharedConnection();
  const key = `lakiph:acct-gap:${accountId}`;
  for (;;) {
    const ok = await redis.set(key, "1", "PX", gapMs, "NX");
    if (ok === "OK") return true;
    if (await shouldAbort()) return false;
    const ttl = await redis.pttl(key);
    await sleep(Math.min(Math.max(ttl, 250), 2000));
  }
}
