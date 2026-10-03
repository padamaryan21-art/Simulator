"use client";

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
import { useLogSearch } from "@/features/history/hooks";
import { DateRange, FilterSelect, Pager, SearchBox, useDebounced, useFilters } from "./common";

const LEVELS = ["debug", "info", "warn", "error"];
const VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  error: "destructive",
  warn: "outline",
  info: "secondary",
  debug: "secondary",
};

export function LogsViewer() {
  const { filters, set, setMany, page, setPage } = useFilters({
    q: "",
    level: "",
    category: "",
    from: "",
    to: "",
  });
  const q = useDebounced(filters.q);
  const { data, isFetching } = useLogSearch({ ...filters, q, page, pageSize: 50 });
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Logs</h1>
      <p className="text-sm text-muted-foreground">
        Events from generation, approval, sending, automation controls and knowledge refreshes.
        Message text, credentials and session data are never written here.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          value={filters.q}
          onChange={(v) => set("q", v)}
          placeholder="Search log messages…"
        />
        <FilterSelect
          label="Any level"
          value={filters.level}
          onChange={(v) => set("level", v)}
          options={LEVELS.map((l) => ({ value: l, label: l }))}
          width="w-32"
        />
        <FilterSelect
          label="Any category"
          value={filters.category}
          onChange={(v) => set("category", v)}
          options={(data?.categories ?? []).map((c) => ({ value: c, label: c }))}
          width="w-40"
        />
        <DateRange
          from={filters.from}
          to={filters.to}
          onChange={(from, to) => setMany({ from, to })}
        />
      </div>

      <Card className={isFetching ? "opacity-70" : undefined}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Event</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(l.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={VARIANT[l.level]}>{l.level}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{l.category}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xl whitespace-normal">
                    <p className="text-sm">{l.message}</p>
                    {l.meta != null && (
                      <p className="font-mono text-xs break-all text-muted-foreground">
                        {JSON.stringify(l.meta)}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!isFetching && !rows.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No log entries match.
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
