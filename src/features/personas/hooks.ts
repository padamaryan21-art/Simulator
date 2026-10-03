"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import type { MemoryRecord } from "@/server/memory/memory";
import type { Persona } from "@/server/personas/personas";
import type { PersonaInput, MemoryScope, RelationshipInput } from "@/validators/personas";
import type { relationships } from "@/db/schema";

export type Relationship = typeof relationships.$inferSelect;

const PERSONAS = ["personas"] as const;
const RELATIONSHIPS = ["relationships"] as const;
const memoriesKey = (scope: MemoryScope, ownerId?: string) =>
  ["memories", scope, ownerId ?? "all"] as const;

function useInvalidate(...keys: QueryKey[]) {
  const qc = useQueryClient();
  return () => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export const usePersonas = () =>
  useQuery({ queryKey: PERSONAS, queryFn: () => apiFetch<Persona[]>("/api/personas") });

export function usePersonaMutations() {
  const invalidate = useInvalidate(PERSONAS, ["personas", "options"], ["memories"]);
  return {
    create: useMutation({
      mutationFn: (input: PersonaInput) =>
        apiFetch<Persona>("/api/personas", { method: "POST", json: input }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; data: Partial<PersonaInput> }) =>
        apiFetch<Persona>(`/api/personas/${v.id}`, { method: "PATCH", json: v.data }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiFetch(`/api/personas/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export const useRelationships = () =>
  useQuery({
    queryKey: RELATIONSHIPS,
    queryFn: () => apiFetch<Relationship[]>("/api/relationships"),
  });

export function useRelationshipMutations() {
  const invalidate = useInvalidate(RELATIONSHIPS, ["memories"]);
  return {
    create: useMutation({
      mutationFn: (input: RelationshipInput) =>
        apiFetch<Relationship>("/api/relationships", { method: "POST", json: input }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; data: Partial<RelationshipInput> }) =>
        apiFetch<Relationship>(`/api/relationships/${v.id}`, { method: "PATCH", json: v.data }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiFetch(`/api/relationships/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export const useMemories = (scope: MemoryScope, ownerId?: string) =>
  useQuery({
    queryKey: memoriesKey(scope, ownerId),
    queryFn: () =>
      apiFetch<MemoryRecord[]>(
        `/api/memories?scope=${scope}${ownerId ? `&ownerId=${ownerId}` : ""}`,
      ),
  });

export function useMemoryMutations() {
  const invalidate = useInvalidate(["memories"]);
  return {
    create: useMutation({
      mutationFn: (v: {
        scope: MemoryScope;
        ownerId: string;
        content: string;
        importance: number;
      }) => apiFetch<MemoryRecord>("/api/memories", { method: "POST", json: v }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { scope: MemoryScope; id: string; content?: string; importance?: number }) =>
        apiFetch<MemoryRecord>(`/api/memories/${v.scope}/${v.id}`, {
          method: "PATCH",
          json: { content: v.content, importance: v.importance },
        }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (v: { scope: MemoryScope; id: string }) =>
        apiFetch(`/api/memories/${v.scope}/${v.id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}
