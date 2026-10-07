"use client";

import { Link2, RefreshCw, Trash2, Unplug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccountMutations, useAccounts } from "@/features/telegram/hooks";
import type { PublicTelegramAccount } from "@/server/telegram/accounts";
import { AddAccountDialog } from "./add-account-dialog";
import { ConnectAccountDialog } from "./connect-account-dialog";

const STATUS_STYLE: Record<
  PublicTelegramAccount["status"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  CONNECTED: { label: "Connected", variant: "default" },
  DISCONNECTED: { label: "Not connected", variant: "secondary" },
  AWAITING_CODE: { label: "Awaiting code", variant: "outline" },
  AWAITING_PASSWORD: { label: "Awaiting 2FA", variant: "outline" },
  ERROR: { label: "Error", variant: "destructive" },
};

export function AccountsManager() {
  const { data, isLoading, error } = useAccounts();
  const m = useAccountMutations();
  const [connecting, setConnecting] = useState<PublicTelegramAccount | null>(null);

  const check = async (a: PublicTelegramAccount) => {
    try {
      const res = (await m.check.mutateAsync(a.id)) as { ok: boolean; error?: string };
      if (res.ok) toast.success(`${a.displayName}: connection OK`);
      else toast.error(`${a.displayName}: ${res.error}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed");
    }
  };

  const disconnect = async (a: PublicTelegramAccount) => {
    if (!confirm(`Log out ${a.displayName} and delete its stored session?`)) return;
    try {
      await m.disconnect.mutateAsync(a.id);
      toast.success(`${a.displayName} disconnected`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed");
    }
  };

  const remove = async (a: PublicTelegramAccount) => {
    if (!confirm(`Delete ${a.displayName}? This also logs out its Telegram session.`)) return;
    try {
      await m.remove.mutateAsync(a.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Telegram Accounts</h1>
        <AddAccountDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <p className="p-4 text-sm text-destructive">{(error as Error).message}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Proxy</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last checked</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((a) => {
                  const st = STATUS_STYLE[a.status];
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.displayName}</TableCell>
                      <TableCell>@{a.username}</TableCell>
                      <TableCell className="text-muted-foreground">{a.phone ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.proxyUrl ? (
                          <span className="text-xs font-mono truncate max-w-[160px] block" title={a.proxyUrl}>
                            {new URL(a.proxyUrl).hostname}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {a.lastError && (
                          <p className="mt-1 max-w-xs text-xs text-destructive">{a.lastError}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.lastCheckedAt ? new Date(a.lastCheckedAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="space-x-1 text-right whitespace-nowrap">
                        {a.hasSession ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => check(a)}
                              disabled={m.check.isPending}
                            >
                              <RefreshCw className="mr-1 size-3.5" /> Check
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => disconnect(a)}>
                              <Unplug className="mr-1 size-3.5" /> Disconnect
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" onClick={() => setConnecting(a)}>
                            <Link2 className="mr-1 size-3.5" />
                            {a.status === "AWAITING_CODE" || a.status === "AWAITING_PASSWORD"
                              ? "Continue"
                              : "Connect"}
                          </Button>
                        )}
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Delete ${a.displayName}`}
                          onClick={() => remove(a)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Connect one account at a time, and wait between logins; Telegram rate-limits rapid sign-ins.
        Sessions are encrypted at rest and never reach the browser.
      </p>

      <ConnectAccountDialog account={connecting} onClose={() => setConnecting(null)} />
    </div>
  );
}
