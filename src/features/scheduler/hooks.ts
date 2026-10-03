"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import type { ScheduleView } from "@/server/scheduler/schedules";
import type { ScheduleUpdate } from "@/validators/schedules";

export type { ScheduleView };

export type QueueStatus = {
  redisConfigured: boolean;
  redisError: string | null;
  dryRun: boolean;
  workerAlive: boolean;
  workerDryRun: boolean;
  automation: "STOPPED" | "RUNNING" | "PAUSED";
  queues: { name: string; counts: Record<string, number> }[];
  failed: { queue: string; id: string; name: string; reason: string; failedAt: number | null }[];
  runs: {
    id: string;
    scheduleId: string;
    runDate: string;
    runAt: string;
    plannedMessages: number;
    status: string;
    sessionId: string | null;
    error: string | null;
  }[];
};

export const useSchedules = () =>
  useQuery({
    queryKey: ["schedules"],
    queryFn: () => apiFetch<ScheduleView[]>("/api/schedules"),
    refetchInterval: 15_000,
  });

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: ScheduleUpdate }) =>
      apiFetch(`/api/schedules/${v.id}`, { method: "PATCH", json: v.patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
    },
  });
}

export const useQueueStatus = () =>
  useQuery({
    queryKey: ["queue"],
    queryFn: () => apiFetch<QueueStatus>("/api/queue"),
    refetchInterval: 5_000,
  });

export function useClearFailed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ cleared: number }>("/api/queue/clear-failed", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  });
}
