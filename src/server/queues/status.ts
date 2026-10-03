import { isDryRun } from "@/lib/env";
import { getAutomationState } from "@/server/scheduler/control";
import { recentRuns } from "@/server/scheduler/schedules";
import { getQueue } from "./conversationQueue";
import { QUEUES, redisConfigured } from "./names";
import { getWorkerInfo } from "./workerStatus";

const COUNT_STATES = ["waiting", "active", "delayed", "failed", "completed"] as const;

export async function getQueueStatus() {
  const configured = redisConfigured();
  const base = {
    redisConfigured: configured,
    dryRun: isDryRun(),
    automation: await getAutomationState(),
    runs: await recentRuns(24),
  };
  if (!configured)
    return {
      ...base,
      workerAlive: false,
      workerDryRun: false,
      queues: [],
      failed: [],
      redisError: null as string | null,
    };

  try {
    const worker = await getWorkerInfo();
    const names = Object.values(QUEUES);
    const queues = await Promise.all(
      names.map(async (name) => ({
        name,
        counts: (await getQueue(name).getJobCounts(...COUNT_STATES)) as Record<string, number>,
      })),
    );
    const failed = (
      await Promise.all(
        names.map(async (name) =>
          (await getQueue(name).getFailed(0, 9)).map((j) => ({
            queue: name,
            id: j.id ?? "",
            name: j.name,
            reason: (j.failedReason ?? "").slice(0, 300),
            failedAt: j.finishedOn ?? null,
          })),
        ),
      )
    ).flat();
    return {
      ...base,
      workerAlive: worker !== null,
      workerDryRun: worker?.dryRun ?? false,
      queues,
      failed,
      redisError: null as string | null,
    };
  } catch (err) {
    return {
      ...base,
      workerAlive: false,
      workerDryRun: false,
      queues: [],
      failed: [],
      redisError: (err as Error).message,
    };
  }
}

export async function clearFailedJobs() {
  let cleared = 0;
  for (const name of Object.values(QUEUES)) {
    const q = getQueue(name);
    const failed = await q.getFailedCount();
    if (failed) {
      await q.clean(0, 1000, "failed");
      cleared += failed;
    }
  }
  return { cleared };
}
