import { isDryRun } from "@/lib/env";
import { getSharedConnection } from "./connection";
import { PROCESS_ID } from "./locks";
import { redisConfigured } from "./names";

const KEY = "lakiph:worker:alive";

/** Called by the worker every few seconds; expires on its own if the worker dies. */
export async function beatWorkerHeartbeat() {
  const info = JSON.stringify({ id: PROCESS_ID, dryRun: isDryRun(), at: Date.now() });
  await getSharedConnection().set(KEY, info, "PX", 30_000);
}

export async function clearWorkerHeartbeat() {
  const redis = getSharedConnection();
  const raw = await redis.get(KEY);
  if (raw && (JSON.parse(raw) as { id?: string }).id === PROCESS_ID) await redis.del(KEY);
}

/** Heartbeat details, or null when no worker has checked in within the last ~30 seconds. */
export async function getWorkerInfo(): Promise<{ dryRun: boolean } | null> {
  if (!redisConfigured()) return null;
  try {
    const raw = await getSharedConnection().get(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { dryRun?: boolean };
    return { dryRun: Boolean(parsed.dryRun) };
  } catch {
    return null;
  }
}

/** True when a worker process has checked in within the last ~30 seconds. */
export async function isWorkerAlive(): Promise<boolean> {
  return (await getWorkerInfo()) !== null;
}
