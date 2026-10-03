"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/fetcher";
import type { PreviewConversation } from "@/server/imports/service";

export type ImportPreview = {
  kind: "xlsx" | "csv" | "pdf";
  totalLines: number;
  conversationCount: number;
  speakers: { name: string; count: number; personaId: string | null }[];
  participants: { id: string; name: string; active: boolean }[];
  issues: {
    byCode: Record<string, number>;
    severe: string[];
    examples: { conversation: number; line: number; code: string; message: string; text: string }[];
  };
  conversations: PreviewConversation[];
};

export function useImportPreview() {
  return useMutation({
    mutationFn: async (v: { file: File; groupId: string; minSize: number; maxSize: number }) => {
      const form = new FormData();
      form.set("file", v.file);
      form.set("groupId", v.groupId);
      form.set("minSize", String(v.minSize));
      form.set("maxSize", String(v.maxSize));
      // multipart: let the browser set the boundary, so no JSON content-type header here
      const res = await fetch("/api/imports/preview", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
      return data as ImportPreview;
    },
  });
}

export function useImportCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      groupId: string;
      conversations: { title: string | null; messages: { personaId: string; text: string }[] }[];
    }) =>
      apiFetch<{ conversations: number; lines: number }>("/api/imports/commit", {
        method: "POST",
        json: v,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["history"] });
    },
  });
}
