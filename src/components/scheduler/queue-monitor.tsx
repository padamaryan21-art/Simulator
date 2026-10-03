"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AutomationControls } from "@/components/dashboard/automation-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useClearFailed, useQueueStatus } from "@/features/scheduler/hooks";
import { SystemBanners } from "./system-banners";

const RUN_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DONE: "default",
  RUNNING: "default",
  FAILED: "destructive",
  PENDING: "outline",
  QUEUED: "outline",
  SKIPPED: "secondary",
  CANCELLED: "secondary",
};

export function QueueMonitor() {
  const { data, isLoading } = useQueueStatus();
  const clear = useClearFailed();

  const clearFailed = async () => {
    try {
      const r = await clear.mutateAsync();
      toast.success(`Cleared ${r.cleared} failed job(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Queue</h1>
      <AutomationControls />
      <SystemBanners />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant={data.workerAlive ? "default" : "secondary"}>
              Worker: {data.workerAlive ? "online" : "offline"}
            </Badge>
            <Badge variant={data.redisConfigured && !data.redisError ? "default" : "destructive"}>
              Redis:{" "}
              {!data.redisConfigured
                ? "not configured"
                : data.redisError
                  ? "unreachable"
                  : "connected"}
            </Badge>
            <Badge variant="outline">Automation: {data.automation}</Badge>
          </div>

          {data.queues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Queues</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Queue</TableHead>
                      <TableHead className="text-right">Waiting</TableHead>
                      <TableHead className="text-right">Active</TableHead>
                      <TableHead className="text-right">Delayed</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.queues.map((q) => (
                      <TableRow key={q.name}>
                        <TableCell className="font-medium">{q.name}</TableCell>
                        {(["waiting", "active", "delayed", "completed", "failed"] as const).map(
                          (k) => (
                            <TableCell
                              key={k}
                              className={`text-right ${k === "failed" && q.counts[k] ? "text-destructive" : ""}`}
                            >
                              {q.counts[k] ?? 0}
                            </TableCell>
                          ),
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {data.failed.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Failed jobs</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearFailed}
                  disabled={clear.isPending}
                >
                  <Trash2 className="mr-1 size-3.5" /> Clear failed
                </Button>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {data.failed.map((f) => (
                  <div key={`${f.queue}-${f.id}`} className="px-6 py-3 text-sm">
                    <p>
                      <Badge variant="outline">{f.queue}</Badge>{" "}
                      <span className="text-muted-foreground">#{f.id}</span>
                    </p>
                    <p className="text-xs text-destructive">{f.reason || "No reason recorded"}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scheduled conversations (last 24h)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run at</TableHead>
                    <TableHead>Messages</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(r.runAt).toLocaleString()}
                      </TableCell>
                      <TableCell>{r.plannedMessages}</TableCell>
                      <TableCell>
                        <Badge variant={RUN_VARIANT[r.status]}>{r.status.toLowerCase()}</Badge>
                      </TableCell>
                      <TableCell className="max-w-md whitespace-normal text-xs text-muted-foreground">
                        {r.error ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!data.runs.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nothing scheduled. Enable a schedule and press START ALL.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
