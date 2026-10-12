"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useSessions } from "@/features/conversations/hooks";
import { useDeleteSessions } from "@/features/history/hooks";

const PAGE_SIZE = 10;

export const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  PENDING_APPROVAL: "outline",
  SENDING: "default",
  COMPLETED: "default",
  CANCELLED: "secondary",
  FAILED: "destructive",
};

export function Simulator() {
  const { data: sessions } = useSessions();
  const del = useDeleteSessions();

  const [requestedPage, setPage] = useState(1);
  const [picked_, setPickedDrafts] = useState<string[]>([]);

  const total = sessions?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageRows = sessions?.slice(pageStart, pageStart + PAGE_SIZE) ?? [];
  const draftIds = (sessions ?? []).filter((s) => s.status === "DRAFT").map((s) => s.id);
  const pickedDrafts = picked_.filter((id) => draftIds.includes(id));
  const pageDraftIds = pageRows.filter((s) => s.status === "DRAFT").map((s) => s.id);
  const pageAllPicked =
    pageDraftIds.length > 0 && pageDraftIds.every((id) => pickedDrafts.includes(id));
  const toggleDraft = (id: string, on: boolean) =>
    setPickedDrafts((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id)));

  const removeDrafts = async () => {
    if (
      !confirm(
        `Delete ${pickedDrafts.length} draft conversation(s) and all their messages? This cannot be undone.`,
      )
    )
      return;
    try {
      let deleted = 0;
      for (let i = 0; i < pickedDrafts.length; i += 500) {
        deleted += (await del.mutateAsync(pickedDrafts.slice(i, i + 500))).deleted;
      }
      toast.success(`Deleted ${deleted} draft(s)`);
      setPickedDrafts([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Simulator</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Conversations (oldest first, in the order the scheduler plays drafts)
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {draftIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={pageAllPicked}
                  onCheckedChange={(c) =>
                    setPickedDrafts((cur) =>
                      c
                        ? [...new Set([...cur, ...pageDraftIds])]
                        : cur.filter((id) => !pageDraftIds.includes(id)),
                    )
                  }
                />
                Select this page
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPickedDrafts(pickedDrafts.length === draftIds.length ? [] : draftIds)
                }
              >
                {pickedDrafts.length === draftIds.length
                  ? "Clear selection"
                  : `Select all ${draftIds.length} drafts`}
              </Button>
              {pickedDrafts.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={removeDrafts}
                  disabled={del.isPending}
                >
                  <Trash2 className="mr-1 size-3.5" /> Delete {pickedDrafts.length}
                </Button>
              )}
            </div>
          )}
          {pageRows.map((s, i) => (
            <div key={s.id} className="flex items-center hover:bg-accent/50">
              <div className="flex w-12 shrink-0 justify-center">
                {s.status === "DRAFT" && (
                  <Checkbox
                    aria-label="Select draft"
                    checked={pickedDrafts.includes(s.id)}
                    onCheckedChange={(c) => toggleDraft(s.id, !!c)}
                  />
                )}
              </div>
              <Link
                href={`/ai/simulator/${s.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 pr-6 text-sm"
              >
                <span className="min-w-0 truncate">
                  <span className="mr-2 inline-block min-w-8 text-muted-foreground">
                    {pageStart + i + 1}.
                  </span>
                  <span className="font-medium">{s.topicTitle ?? "Free topic"}</span>
                  <span className="text-muted-foreground"> · {s.groupName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{s.mode}</Badge>
                  <Badge variant={STATUS_VARIANT[s.status]}>{s.status.replace("_", " ")}</Badge>
                  <span className="hidden text-muted-foreground sm:inline">
                    {new Date(s.createdAt).toLocaleString()}
                  </span>
                </span>
              </Link>
            </div>
          ))}
          {!sessions?.length && (
            <p className="px-6 py-4 text-sm text-muted-foreground">Nothing generated yet.</p>
          )}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-3 text-sm">
              <span className="text-muted-foreground">
                {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span>
                  Page {page} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
