"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/fetcher";
import type { ImageKind } from "@/lib/image-kinds";
import type { ImageSettings } from "@/validators/settings";

export type ImageStatus = "AVAILABLE" | "RESERVED" | "USED" | "DISABLED";

export type LibraryImage = {
  id: string;
  filename: string;
  caption: string;
  kind: ImageKind;
  width: number;
  height: number;
  bytes: number;
  enabled: boolean;
  usedAt: string | null;
  createdAt: string;
  topicId: string | null;
  topicTitle: string | null;
  personaId: string | null;
  personaName: string | null;
  status: ImageStatus;
};

export type UploadResult = { filename: string; ok: boolean; id?: string; error?: string };

export const imageFileUrl = (id: string) => `/api/images/${id}/file`;

export const useImages = (filter: { topicId?: string; personaId?: string; status?: string } = {}) =>
  useQuery({
    queryKey: ["images", filter],
    queryFn: () => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(filter)) if (v) p.set(k, v);
      return apiFetch<LibraryImage[]>(`/api/images?${p}`);
    },
  });

export const useImageSettings = () =>
  useQuery({
    queryKey: ["image-settings"],
    queryFn: () => apiFetch<ImageSettings>("/api/images/settings"),
  });

export function useImageMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["images"] });
    qc.invalidateQueries({ queryKey: ["session"] });
  };
  return {
    upload: useMutation({
      mutationFn: async (v: {
        files: File[];
        topicId: string;
        personaId: string;
        kind: ImageKind;
        caption: string;
      }) => {
        const form = new FormData();
        v.files.forEach((f) => form.append("files", f));
        form.set("topicId", v.topicId);
        form.set("personaId", v.personaId);
        form.set("kind", v.kind);
        form.set("caption", v.caption);
        const res = await fetch("/api/images", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new ApiError(data.error ?? `Upload failed (${res.status})`, res.status);
        return data.results as UploadResult[];
      },
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: {
        id: string;
        patch: {
          caption?: string;
          kind?: ImageKind;
          topicId?: string | null;
          personaId?: string | null;
          enabled?: boolean;
        };
      }) => apiFetch(`/api/images/${v.id}`, { method: "PATCH", json: v.patch }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiFetch(`/api/images/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
    release: useMutation({
      mutationFn: (id: string) => apiFetch(`/api/images/${id}/reset`, { method: "POST" }),
      onSuccess: refresh,
    }),
    saveSettings: useMutation({
      mutationFn: (s: ImageSettings) =>
        apiFetch("/api/images/settings", { method: "PATCH", json: s }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["image-settings"] }),
    }),
  };
}
