"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMessageSearch } from "@/features/history/hooks";
import { usePersonas } from "@/features/personas/hooks";
import { useGroups } from "@/features/telegram/hooks";
import { DateRange, FilterSelect, Pager, SearchBox, useDebounced, useFilters } from "./common";

const STATUSES = [
  "GENERATED",
  "EDITED",
  "APPROVED",
  "SKIPPED",
  "SCHEDULED",
  "SENT",
  "FAILED",
  "CANCELLED",
];

const VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SENT: "default",
  APPROVED: "default",
  FAILED: "destructive",
  SKIPPED: "secondary",
  CANCELLED: "secondary",
};

export function MessagesHistory() {
  const { filters, set, setMany, page, setPage } = useFilters({
    q: "",
    groupId: "",
    personaId: "",
    status: "",
    from: "",
    to: "",
  });
  const q = useDebounced(filters.q);
  const { data, isFetching } = useMessageSearch({ ...filters, q, page, pageSize: 50 });
  const { data: groups } = useGroups();
  const { data: personas } = usePersonas();
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Messages</h1>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          value={filters.q}
          onChange={(v) => set("q", v)}
          placeholder="Search message text…"
        />
        <FilterSelect
          label="All groups"
          value={filters.groupId}
          onChange={(v) => set("groupId", v)}
          options={(groups ?? []).map((g) => ({ value: g.id, label: g.name }))}
          width="w-52"
        />
        <FilterSelect
          label="All personas"
          value={filters.personaId}
          onChange={(v) => set("personaId", v)}
          options={(personas ?? []).map((p) => ({ value: p.id, label: p.name }))}
          width="w-40"
        />
        <FilterSelect
          label="Any status"
          value={filters.status}
          onChange={(v) => set("status", v)}
          options={STATUSES.map((s) => ({ value: s, label: s.toLowerCase() }))}
          width="w-36"
        />
        <DateRange
          from={filters.from}
          to={filters.to}
          onChange={(from, to) => setMany({ from, to })}
        />
      </div>
      <p className="text-xs text-muted-foreground">Dates use Philippine time.</p>

      <Card className={isFetching ? "opacity-70" : undefined}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(m.sentAt ?? m.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    {m.personaName ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-lg whitespace-normal">
                    <Link href={`/ai/simulator/${m.sessionId}`} className="hover:underline">
                      {m.content}
                    </Link>
                    {m.errorMessage && <p className="text-xs text-destructive">{m.errorMessage}</p>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {m.groupName}
                    {m.environment === "REAL_COMMUNITY" && (
                      <Badge variant="destructive" className="ml-2">
                        REAL
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={VARIANT[m.status] ?? "outline"}>{m.status.toLowerCase()}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!isFetching && !rows.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No messages match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pager
        page={data?.page ?? 1}
        pageSize={data?.pageSize ?? 50}
        total={data?.total ?? 0}
        onPage={setPage}
      />
    </div>
  );
}
