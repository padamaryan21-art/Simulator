"use client";

import { AlertTriangle, FlaskConical, ServerOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useQueueStatus } from "@/features/scheduler/hooks";

/** Warnings that explain why scheduled sending is not (or not really) happening. */
export function SystemBanners() {
  const { data } = useQueueStatus();
  if (!data) return null;
  return (
    <div className="space-y-2">
      {data.workerAlive && data.workerDryRun && (
        <Alert variant="destructive">
          <FlaskConical className="size-4" />
          <AlertTitle>DRY RUN: nothing is being sent to Telegram</AlertTitle>
          <AlertDescription>
            The worker was started with SIMULATION_DRY_RUN=true. Messages are marked sent but never
            reach Telegram. Remove it from .env.local and restart the worker for real sending.
          </AlertDescription>
        </Alert>
      )}
      {!data.redisConfigured && (
        <Alert>
          <ServerOff className="size-4" />
          <AlertTitle>Redis is not configured</AlertTitle>
          <AlertDescription>
            Scheduling needs REDIS_URL in .env.local. Manual sends still work without it.
          </AlertDescription>
        </Alert>
      )}
      {data.redisConfigured && data.redisError && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Cannot reach Redis</AlertTitle>
          <AlertDescription>{data.redisError}</AlertDescription>
        </Alert>
      )}
      {data.redisConfigured && !data.redisError && !data.workerAlive && (
        <Alert>
          <ServerOff className="size-4" />
          <AlertTitle>Worker is not running</AlertTitle>
          <AlertDescription>
            Scheduled conversations only run while the worker is up. Start it in a terminal with{" "}
            <code className="rounded bg-muted px-1">npm run worker</code> (or run everything with{" "}
            <code className="rounded bg-muted px-1">npm run dev:all</code>).
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
