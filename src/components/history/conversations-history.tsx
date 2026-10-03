"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { STATUS_VARIANT } from "@/components/conversations/simulator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDeleteSessions, useSessionSearch } from "@/features/history/hooks";
import { useGroups } from "@/features/telegram/hooks";
import { DateRange, FilterSelect, Pager, SearchBox, useDebounced, useFilters } from "./common";

const STATUSES = ["DRAFT", "PENDING_APPROVAL", "SENDING", "COMPLETED", "CANCELLED", "FAILED"];
const MODES = ["PREVIEW", "MANUAL", "AUTOMATIC"];

export function ConversationsHistory() {
  const { filters, set, setMany, page, setPage } = useFilters({
    q: "",
    groupId: "",
    status: "",
    mode: "",
    from: "",
    to: "",
  });
  const q = useDebounced(filters.q);
  const { data, isFetching } = useSessionSearch({ ...filters, q, page, pageSize: 25 });
  const { data: groups } = useGroups();
  const del = useDeleteSessions();
  const [picked, setPicked] = useState<string[]>([]);

  const rows = data?.rows ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.includes(r.id));

  const remove = async () => {
    if (
      !confirm(
        `Delete ${picked.length} conversation(s) and all their messages? This cannot be undone.`,
      )
    )
      return;
    try {
      const r = await del.mutateAsync(picked);
      toast.success(
        `Deleted ${r.deleted}${r.skipped ? ` · ${r.skipped} skipped (still sending)` : ""}`,
      );
      setPicked([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Conversations</h1>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          value={filters.q}
          onChange={(v) => set("q", v)}
          placeholder="Search topic or message text…"
        />
        <FilterSelect
          label="All groups"
          value={filters.groupId}
          onChange={(v) => set("groupId", v)}
          options={(groups ?? []).map((g) => ({ value: g.id, label: g.name }))}
          width="w-52"
        />
        <FilterSelect
          label="Any status"
          value={filters.status}
          onChange={(v) => set("status", v)}
          options={STATUSES.map((s) => ({ value: s, label: s.replace("_", " ") }))}
        />
        <FilterSelect
          label="Any mode"
          value={filters.mode}
          onChange={(v) => set("mode", v)}
          options={MODES.map((m) => ({ value: m, label: m }))}
          width="w-36"
        />
        <DateRange
          from={filters.from}
          to={filters.to}
          onChange={(from, to) => setMany({ from, to })}
        />
        {picked.length > 0 && (
          <Button variant="destructive" size="sm" onClick={remove} disabled={del.isPending}>
            <Trash2 className="mr-1 size-3.5" /> Delete {picked.length}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Dates use Philippine time.</p>

      <Card className={isFetching ? "opacity-70" : undefined}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allPicked}
                    onCheckedChange={(c) => setPicked(c ? rows.map((r) => r.id) : [])}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>When</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Messages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Checkbox
                      checked={picked.includes(r.id)}
                      onCheckedChange={(c) =>
                        setPicked((cur) => (c ? [...cur, r.id] : cur.filter((x) => x !== r.id)))
                      }
                      aria-label="Select conversation"
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Link href={`/ai/simulator/${r.id}`} className="font-medium hover:underline">
                      {r.topicTitle ?? "Free topic"}
                    </Link>
                    {r.source === "IMPORTED" && (
                      <Badge variant="secondary" className="ml-2">
                        imported
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.groupName}
                    {r.environment === "REAL_COMMUNITY" && (
                      <Badge variant="destructive" className="ml-2">
                        REAL
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.mode}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]}>{r.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.sent}/{r.total} sent
                  </TableCell>
                </TableRow>
              ))}
              {!isFetching && !rows.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No conversations match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pager
        page={data?.page ?? 1}
        pageSize={data?.pageSize ?? 25}
        total={data?.total ?? 0}
        onPage={setPage}
      />
    </div>
  );
}
