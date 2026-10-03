"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import type { PublicTelegramAccount } from "@/server/telegram/accounts";
import type { GroupWithParticipants } from "@/server/groups/groups";
import type { CreateAccountInput, CreateGroupInput, UpdateGroupInput } from "@/validators/telegram";

const ACCOUNTS = ["telegram-accounts"] as const;
const GROUPS = ["groups"] as const;

export const useAccounts = () =>
  useQuery({
    queryKey: ACCOUNTS,
    queryFn: () => apiFetch<PublicTelegramAccount[]>("/api/telegram/accounts"),
    refetchInterval: 30_000,
  });

export function useAccountMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ACCOUNTS });
  const act = (id: string, action: string, json?: unknown) =>
    apiFetch<Record<string, unknown>>(`/api/telegram/accounts/${id}/${action}`, {
      method: "POST",
      json,
    });
  return {
    create: useMutation({
      mutationFn: (input: CreateAccountInput) =>
        apiFetch<PublicTelegramAccount>("/api/telegram/accounts", { method: "POST", json: input }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiFetch(`/api/telegram/accounts/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    sendCode: useMutation({
      mutationFn: (v: { id: string; phone: string }) => act(v.id, "send-code", { phone: v.phone }),
      onSettled: invalidate,
    }),
    verifyCode: useMutation({
      mutationFn: (v: { id: string; code: string }) => act(v.id, "verify-code", { code: v.code }),
      onSettled: invalidate,
    }),
    verifyPassword: useMutation({
      mutationFn: (v: { id: string; password: string }) =>
        act(v.id, "verify-password", { password: v.password }),
      onSettled: invalidate,
    }),
    cancel: useMutation({ mutationFn: (id: string) => act(id, "cancel"), onSettled: invalidate }),
    check: useMutation({ mutationFn: (id: string) => act(id, "check"), onSettled: invalidate }),
    disconnect: useMutation({
      mutationFn: (id: string) => act(id, "disconnect"),
      onSettled: invalidate,
    }),
  };
}

export const useGroups = () =>
  useQuery({ queryKey: GROUPS, queryFn: () => apiFetch<GroupWithParticipants[]>("/api/groups") });

export const usePersonaOptions = () =>
  useQuery({
    queryKey: ["personas", "options"],
    queryFn: () => apiFetch<{ id: string; name: string; active: boolean }[]>("/api/personas"),
  });

export function useGroupMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: GROUPS });
  return {
    create: useMutation({
      mutationFn: (input: CreateGroupInput) =>
        apiFetch("/api/groups", { method: "POST", json: input }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; data: UpdateGroupInput }) =>
        apiFetch(`/api/groups/${v.id}`, { method: "PATCH", json: v.data }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiFetch(`/api/groups/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    resolve: useMutation({
      mutationFn: (v: { id: string; accountId: string }) =>
        apiFetch<{ chatId: string | null; title: string | null }>(`/api/groups/${v.id}/resolve`, {
          method: "POST",
          json: { accountId: v.accountId },
        }),
      onSuccess: invalidate,
    }),
  };
}
