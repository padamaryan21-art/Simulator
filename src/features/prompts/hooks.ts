"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import type { BuiltinPrompt } from "@/lib/prompts/builtin";
import type { CustomPrompt } from "@/server/prompts/service";
import type { PromptInput } from "@/validators/prompts";

export type PromptLibrary = { builtin: BuiltinPrompt[]; custom: CustomPrompt[] };

export const usePromptLibrary = () =>
  useQuery({ queryKey: ["prompts"], queryFn: () => apiFetch<PromptLibrary>("/api/prompts") });

export function usePromptMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["prompts"] });
  return {
    create: useMutation({
      mutationFn: (v: PromptInput) => apiFetch("/api/prompts", { method: "POST", json: v }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; patch: Partial<PromptInput> }) =>
        apiFetch(`/api/prompts/${v.id}`, { method: "PATCH", json: v.patch }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiFetch(`/api/prompts/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
  };
}
