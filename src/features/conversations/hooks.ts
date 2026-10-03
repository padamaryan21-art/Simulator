"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  conversationMessages,
  conversationSessions,
  groups,
  topicCategories,
  topics,
} from "@/db/schema";
import { apiFetch } from "@/lib/fetcher";
import type { ValidationIssue } from "@/server/claude/validators";
import type { CreateConversationInput } from "@/validators/conversations";
import type { SendingSettings } from "@/validators/settings";
import type { BulkInput } from "@/validators/bulk";
import type { TopicInput } from "@/validators/topics";

export type Session = typeof conversationSessions.$inferSelect;
export type SessionListItem = Session & { groupName: string; topicTitle: string | null };
export type SessionMessage = typeof conversationMessages.$inferSelect & { personaName: string };
export type SessionDetail = {
  session: Session;
  group: typeof groups.$inferSelect;
  topicTitle: string | null;
  messages: SessionMessage[];
};
export type Topic = typeof topics.$inferSelect;
export type TopicCategory = typeof topicCategories.$inferSelect;

export const useSessions = () =>
  useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiFetch<SessionListItem[]>("/api/conversations"),
  });

/** Polls every 3s while the session is sending so statuses update live. */
export const useSession = (id: string) =>
  useQuery({
    queryKey: ["session", id],
    queryFn: () => apiFetch<SessionDetail>(`/api/conversations/${id}`),
    refetchInterval: (q) => (q.state.data?.session.status === "SENDING" ? 3000 : false),
  });

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConversationInput) =>
      apiFetch<{ sessionId: string; warnings: ValidationIssue[]; provider: string; model: string }>(
        "/api/conversations",
        { method: "POST", json: input },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useSessionActions(sessionId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["session", sessionId] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
  };
  const post = (action: string, json?: unknown) =>
    apiFetch<Record<string, unknown>>(`/api/conversations/${sessionId}/${action}`, {
      method: "POST",
      json: json ?? {},
    });
  return {
    approve: useMutation({
      mutationFn: (messageIds?: string[]) => post("approve", { messageIds }),
      onSuccess: refresh,
    }),
    enableSending: useMutation({ mutationFn: () => post("enable-sending"), onSuccess: refresh }),
    send: useMutation({ mutationFn: () => post("send"), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: () => post("cancel"), onSuccess: refresh }),
    editMessage: useMutation({
      mutationFn: (v: {
        id: string;
        content?: string;
        action?: "skip" | "restore";
        /** A library image to attach, or null to remove the current one. */
        imageId?: string | null;
      }) =>
        apiFetch(`/api/conversation-messages/${v.id}`, {
          method: "PATCH",
          json: { content: v.content, action: v.action, imageId: v.imageId },
        }),
      onSuccess: refresh,
    }),
    deleteMessage: useMutation({
      mutationFn: (id: string) =>
        apiFetch(`/api/conversation-messages/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
    regenerate: useMutation({
      mutationFn: (id: string) =>
        apiFetch(`/api/conversation-messages/${id}/regenerate`, { method: "POST" }),
      onSuccess: refresh,
    }),
  };
}

export const useTopics = () =>
  useQuery({
    queryKey: ["topics"],
    queryFn: () => apiFetch<{ categories: TopicCategory[]; topics: Topic[] }>("/api/topics"),
  });

export function useTopicMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["topics"] });
  return {
    create: useMutation({
      mutationFn: (input: TopicInput) => apiFetch("/api/topics", { method: "POST", json: input }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; data: Partial<TopicInput> }) =>
        apiFetch(`/api/topics/${v.id}`, { method: "PATCH", json: v.data }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiFetch(`/api/topics/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export type SettingsData = {
  sending: SendingSettings;
  llm: { strategy: string; pool: { provider: string; model: string; free: boolean }[] };
};

export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => apiFetch<SettingsData>("/api/settings") });

export function useSaveSending() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sending: SendingSettings) =>
      apiFetch("/api/settings", { method: "PATCH", json: sending }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

export type AutomationStateName = "STOPPED" | "RUNNING" | "PAUSED";

export const useAutomation = () =>
  useQuery({
    queryKey: ["automation"],
    queryFn: () => apiFetch<{ state: AutomationStateName }>("/api/automation"),
    refetchInterval: 10_000,
  });

export function useAutomationControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: "start" | "pause" | "resume" | "stop") =>
      apiFetch<{ state: AutomationStateName; cancelledSessions: number }>("/api/automation", {
        method: "POST",
        json: { action },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

export type BulkJob = {
  id: string;
  status: "RUNNING" | "COMPLETED" | "CANCELLED" | "FAILED";
  targetMessages: number;
  producedMessages: number;
  conversations: number;
  failures: number;
  lastError: string | null;
};

export const useBulkJob = () =>
  useQuery({
    queryKey: ["bulk"],
    queryFn: () => apiFetch<{ job: BulkJob | null }>("/api/bulk"),
    refetchInterval: (q) => (q.state.data?.job?.status === "RUNNING" ? 3000 : false),
  });

export function useBulkControl() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["bulk"] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
  };
  return {
    start: useMutation({
      mutationFn: (input: BulkInput) => apiFetch("/api/bulk", { method: "POST", json: input }),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: () => apiFetch("/api/bulk", { method: "DELETE" }),
      onSuccess: refresh,
    }),
  };
}
