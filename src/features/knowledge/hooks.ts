"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { websiteFacts, websiteSources } from "@/db/schema";
import { apiFetch } from "@/lib/fetcher";
import type { FactStatus } from "@/validators/knowledge";

export type Source = typeof websiteSources.$inferSelect;
export type Fact = typeof websiteFacts.$inferSelect;
export type KnowledgePage = {
  id: string;
  sourceId: string;
  url: string;
  title: string | null;
  fetchMode: "STATIC" | "RENDERED" | "MANUAL" | null;
  lastError: string | null;
  fetchedAt: string | null;
  contentLength: number;
};
export type KnowledgeData = { sources: Source[]; pages: KnowledgePage[]; facts: Fact[] };

const KEY = ["knowledge"] as const;

export const useKnowledge = () =>
  useQuery({ queryKey: KEY, queryFn: () => apiFetch<KnowledgeData>("/api/knowledge") });

export function useKnowledgeMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    addSource: useMutation({
      mutationFn: (v: { name: string; baseUrl: string }) =>
        apiFetch("/api/knowledge/sources", { method: "POST", json: v }),
      onSuccess: invalidate,
    }),
    deleteSource: useMutation({
      mutationFn: (id: string) => apiFetch(`/api/knowledge/sources/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    refreshSource: useMutation({
      mutationFn: (id: string) =>
        apiFetch<{ results: { url: string; ok: boolean; error?: string; proposed?: number }[] }>(
          `/api/knowledge/sources/${id}/refresh`,
          { method: "POST" },
        ),
      onSettled: invalidate,
    }),
    addPage: useMutation({
      mutationFn: (v: { sourceId: string; url: string; content?: string }) =>
        apiFetch<{ proposed: number; mode: string }>("/api/knowledge/pages", {
          method: "POST",
          json: v,
        }),
      onSettled: invalidate,
    }),
    refreshPage: useMutation({
      mutationFn: (id: string) =>
        apiFetch<{ proposed: number; outdated: number; changed: boolean }>(
          `/api/knowledge/pages/${id}`,
          { method: "POST" },
        ),
      onSettled: invalidate,
    }),
    deletePage: useMutation({
      mutationFn: (id: string) => apiFetch(`/api/knowledge/pages/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    createFact: useMutation({
      mutationFn: (v: { sourceId: string; fact: string; sourceUrl: string; status: FactStatus }) =>
        apiFetch("/api/knowledge/facts", { method: "POST", json: v }),
      onSuccess: invalidate,
    }),
    updateFact: useMutation({
      mutationFn: (v: { id: string; fact?: string; status?: FactStatus }) =>
        apiFetch(`/api/knowledge/facts/${v.id}`, {
          method: "PATCH",
          json: { fact: v.fact, status: v.status },
        }),
      onSuccess: invalidate,
    }),
    bulkStatus: useMutation({
      mutationFn: (v: { ids: string[]; status: FactStatus }) =>
        apiFetch("/api/knowledge/facts/bulk", { method: "POST", json: v }),
      onSuccess: invalidate,
    }),
    deleteFact: useMutation({
      mutationFn: (id: string) => apiFetch(`/api/knowledge/facts/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}
