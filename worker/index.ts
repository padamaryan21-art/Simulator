import { config } from "dotenv";

config({ path: ".env.local" });
config();

/**
 * Worker entry point:  npm run worker
 * Runs the scheduler tick, conversation generation, message sending, memory and knowledge jobs.
 * Leave it running while the simulation should be active.
 */
async function main() {
  const { getEnv } = await import("../src/lib/env");
  const { logger } = await import("../src/lib/logger");
  const env = getEnv();
  if (!env.REDIS_URL) {
    console.error("REDIS_URL is not set. Add it to .env.local before starting the worker.");
    process.exit(1);
  }

  const { startSchedulerWorker } = await import("./schedulerWorker");
  const { startConversationWorker } = await import("./conversationWorker");
  const { startMessageWorker } = await import("./messageWorker");
  const { startMemoryWorker, startKnowledgeWorker } = await import("./auxWorkers");
  const { startSchedulerTick } = await import("../src/server/queues/schedulerQueue");
  const { beatWorkerHeartbeat, clearWorkerHeartbeat } =
    await import("../src/server/queues/workerStatus");
  const { closeSharedConnection } = await import("../src/server/queues/connection");
  const { getQueue } = await import("../src/server/queues/conversationQueue");
  const { releaseAllClients } = await import("../src/server/telegram/client");
  const { writeLog } = await import("../src/server/conversations/logs");
  const { captureError } = await import("../src/lib/monitoring");

  const workers = [
    startSchedulerWorker(),
    startConversationWorker(),
    startMessageWorker(),
    startMemoryWorker(),
    startKnowledgeWorker(),
  ];
  for (const w of workers) {
    w.on("failed", (job, err) => {
      void captureError(err, `worker:${w.name}`, { jobId: String(job?.id ?? "") });
      logger.error({ queue: w.name, jobId: job?.id, err: err.message }, "job failed");
      void writeLog("error", "worker", `Job failed in ${w.name}: ${err.message}`.slice(0, 300), {
        jobId: job?.id,
      });
    });
    w.on("error", (err) => logger.warn({ queue: w.name, err: err.message }, "worker error"));
  }

  /**
   * BullMQ's own stall-detection only protects a job that already became ACTIVE. It has no
   * detection for a worker whose poll loop silently stops pulling new jobs at all (observed:
   * the message-send worker's dedicated connection went idle for 50+ minutes - no bzpopmin -
   * while jobs piled up in "waiting" and the unrelated heartbeat kept ticking the whole time).
   * If a queue has waiting jobs but zero active ones for several checks in a row, force-exit so
   * Railway's restartPolicyType "ALWAYS" brings up a fresh process with fresh connections.
   */
  const STUCK_CHECKS = 3;
  const stuckStreak = new Map<string, number>();
  const watchdog = setInterval(() => {
    void (async () => {
      for (const w of workers) {
        try {
          const counts = await getQueue(w.name).getJobCounts("waiting", "active");
          const stuck = (counts.waiting ?? 0) > 0 && (counts.active ?? 0) === 0;
          const streak = stuck ? (stuckStreak.get(w.name) ?? 0) + 1 : 0;
          stuckStreak.set(w.name, streak);
          if (streak >= STUCK_CHECKS) {
            logger.error(
              { queue: w.name, waiting: counts.waiting },
              "worker queue stuck (waiting jobs, nothing active); restarting process",
            );
            await writeLog(
              "error",
              "worker",
              `Queue ${w.name} stuck: ${counts.waiting} waiting, 0 active; restarting`,
            ).catch(() => undefined);
            process.exit(1);
          }
        } catch {
          /* a transient Redis error here should not itself trigger a restart */
        }
      }
    })();
  }, 60_000);
  watchdog.unref();

  await beatWorkerHeartbeat();
  const heartbeat = setInterval(() => void beatWorkerHeartbeat().catch(() => undefined), 10_000);
  await startSchedulerTick();
  await writeLog("info", "worker", "Worker started");
  logger.info({ queues: workers.map((w) => w.name) }, "worker online");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "worker shutting down");
    clearInterval(heartbeat);
    clearInterval(watchdog);
    await clearWorkerHeartbeat().catch(() => undefined);
    // Do not wait for long send jobs: they are recovered by the next worker's tick.
    await Promise.all(workers.map((w) => w.close(true).catch(() => undefined)));
    await releaseAllClients().catch(() => undefined);
    await writeLog("info", "worker", "Worker stopped").catch(() => undefined);
    await closeSharedConnection();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
