"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import type { automationLogs } from "@/db/schema";

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };

export type SessionRow = {
  id: string;
  mode: "PREVIEW" | "MANUAL" | "AUTOMATIC";
  status: "DRAFT" | "PENDING_APPROVAL" | "SENDING" | "COMPLETED" | "CANCELLED" | "FAILED";
  environment: "PRIVATE_SIMULATION" | "REAL_COMMUNITY";
  createdAt: string;
  endedAt: string | null;
  groupId: string;
  groupName: string;
  topicTitle: string | null;
  source: "GENERATED" | "IMPORTED";
  total: number;
  sent: number;
};

export type MessageRow = {
  id: string;
  sessionId: string;
  content: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  approvedAt: string | null;
  errorMessage: string | null;
  personaName: string | null;
  groupName: string;
  environment: "PRIVATE_SIMULATION" | "REAL_COMMUNITY";
};

export type LogRow = Omit<typeof automationLogs.$inferSelect, "createdAt"> & { createdAt: string };

/** Drops empty filter values so URLs and cache keys stay clean. */
function qs(filters: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters))
    if (v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
}

export const useSessionSearch = (filters: Record<string, string | number | undefined>) =>
  useQuery({
    queryKey: ["history", "sessions", filters],
    queryFn: () => apiFetch<Page<SessionRow>>(`/api/history/sessions?${qs(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useMessageSearch = (filters: Record<string, string | number | undefined>) =>
  useQuery({
    queryKey: ["history", "messages", filters],
    queryFn: () => apiFetch<Page<MessageRow>>(`/api/history/messages?${qs(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useLogSearch = (filters: Record<string, string | number | undefined>) =>
  useQuery({
    queryKey: ["history", "logs", filters],
    queryFn: () =>
      apiFetch<Page<LogRow> & { categories: string[] }>(`/api/history/logs?${qs(filters)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

export function useDeleteSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ deleted: number; skipped: number }>("/api/history/sessions/delete", {
        method: "POST",
        json: { ids },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}
