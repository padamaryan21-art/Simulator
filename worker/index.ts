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
