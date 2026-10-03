"use client";

import { Layers } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBulkControl, useBulkJob } from "@/features/conversations/hooks";
import { bulkSchema, bulkTotal } from "@/validators/bulk";

export function BulkCard({
  groupId,
  participantIds,
}: {
  groupId: string;
  participantIds: string[];
}) {
  const { data } = useBulkJob();
  const { start, cancel } = useBulkControl();
  const [perAccount, setPerAccount] = useState(400);
  const [days, setDays] = useState(1);
  const [min, setMin] = useState(15);
  const [max, setMax] = useState(35);
  const job = data?.job;
  const running = job?.status === "RUNNING";

  const submit = async () => {
    const parsed = bulkSchema.safeParse({
      groupId,
      participantIds,
      messagesPerAccountPerDay: perAccount,
      days,
      minPerConversation: min,
      maxPerConversation: max,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    const total = bulkTotal(parsed.data);
    const approxConvos = Math.ceil(total / ((min + max) / 2));
    if (
      !confirm(
        `Generate about ${total} messages (~${approxConvos} conversations) as drafts? Nothing is sent.`,
      )
    )
      return;
    try {
      await start.mutateAsync(parsed.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start");
    }
  };

  const pct = job
    ? Math.min(100, Math.round((job.producedMessages / job.targetMessages) * 100))
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bulk generation (private simulation only)</CardTitle>
        <CardDescription>
          Generates many conversations in a row until the total is reached. They are saved as
          preview drafts and nothing is sent. Each conversation sees the earlier ones to avoid
          repeating itself.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-per">Messages per account per day</Label>
            <Input
              id="bulk-per"
              type="number"
              min={10}
              max={1000}
              value={perAccount}
              onChange={(e) => setPerAccount(Number(e.target.value))}
              disabled={running}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-days">Days of content</Label>
            <Input
              id="bulk-days"
              type="number"
              min={1}
              max={5}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              disabled={running}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-min">Min per conversation</Label>
            <Input
              id="bulk-min"
              type="number"
              min={6}
              max={40}
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
              disabled={running}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-max">Max per conversation</Label>
            <Input
              id="bulk-max"
              type="number"
              min={6}
              max={40}
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
              disabled={running}
            />
          </div>
        </div>

        <p className="text-sm">
          {participantIds.length} accounts � {perAccount} � {days} day(s) ={" "}
          <span className="font-semibold">
            {bulkTotal({
              participantIds,
              messagesPerAccountPerDay: perAccount,
              days,
            }).toLocaleString()}{" "}
            messages
          </span>
        </p>

        {job && (
          <div className="space-y-1.5">
            <div className="h-2 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">
              {job.status} · {job.producedMessages} / {job.targetMessages} messages ·{" "}
              {job.conversations} conversations
              {job.failures > 0 && ` · ${job.failures} failed attempt(s)`}
            </p>
            {job.lastError && job.status !== "COMPLETED" && (
              <p className="text-xs text-destructive">Last error: {job.lastError}</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={submit}
            disabled={running || start.isPending || participantIds.length < 2}
          >
            <Layers className="mr-1.5 size-4" /> Generate drafts
          </Button>
          {running && (
            <Button variant="outline" onClick={() => cancel.mutate()}>
              Stop
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
