"use client";

import { AlertTriangle, CalendarClock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AutomationControls } from "@/components/dashboard/automation-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSchedules, useUpdateSchedule, type ScheduleView } from "@/features/scheduler/hooks";
import { scheduleUpdateSchema } from "@/validators/schedules";
import { DutyEditor, normalizeRule, type DutyRules } from "./duty-editor";
import { SystemBanners } from "./system-banners";

const fmt = (iso: string, tz: string) =>
  new Date(iso).toLocaleString("en-PH", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function SchedulerManager() {
  const { data, isLoading, error } = useSchedules();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Scheduler</h1>
      <AutomationControls />
      <SystemBanners />
      <p className="text-sm text-muted-foreground">
        Conversations are generated and sent only while you are on duty. Set your shifts below; with
        no shifts set, nothing runs. The real community is never scheduled.
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data?.map((v) => (
        <ScheduleCard
          key={
            v.schedule.id +
            JSON.stringify(v.schedule.weeklyPattern) +
            JSON.stringify(v.schedule.dateOverrides)
          }
          view={v}
        />
      ))}
      {data && !data.length && (
        <p className="text-sm text-muted-foreground">
          No private simulation group yet. Add one on the Groups page.
        </p>
      )}
    </div>
  );
}

function ScheduleCard({ view }: { view: ScheduleView }) {
  const { schedule: sc, progress } = view;
  const update = useUpdateSchedule();

  const [perAccount, setPerAccount] = useState(sc.messagesPerAccountPerDay);
  const [minSize, setMinSize] = useState(sc.messagesPerSessionMin);
  const [maxSize, setMaxSize] = useState(sc.messagesPerSessionMax);
  const [gap, setGap] = useState(sc.minGapPerAccountSec);
  const [tz, setTz] = useState(sc.timezone);
  const [weekly, setWeekly] = useState<DutyRules>(sc.weeklyPattern as DutyRules);
  const [overrides, setOverrides] = useState<DutyRules>(sc.dateOverrides as DutyRules);

  const hasDuty =
    Object.values(weekly).some((r) => r && r.type !== "OFF") ||
    Object.values(overrides).some((r) => r && r.type !== "OFF");

  const save = async (patch: Parameters<typeof update.mutateAsync>[0]["patch"], ok = "Saved") => {
    const parsed = scheduleUpdateSchema.safeParse(patch);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    try {
      await update.mutateAsync({ id: sc.id, patch: parsed.data });
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const clean = (r: DutyRules) =>
    Object.fromEntries(Object.entries(r).flatMap(([k, v]) => (v ? [[k, normalizeRule(v)]] : [])));

  const pct =
    progress && progress.target > 0
      ? Math.min(100, Math.round((progress.sent / progress.target) * 100))
      : 0;
  const counts = view.runs.reduce<Record<string, number>>(
    (a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a),
    {},
  );
  const upcoming = view.runs.filter((r) => r.status === "PENDING").slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <CalendarClock className="size-4" /> {sc.groupName}
          </span>
          <span className="flex items-center gap-3">
            <Badge variant={view.onDuty ? "default" : "secondary"}>
              {view.onDuty ? "On duty now" : "Off duty"}
            </Badge>
            <span className="flex items-center gap-2 text-sm font-normal">
              <Switch
                checked={sc.enabled}
                aria-label="Enable schedule"
                onCheckedChange={(v) =>
                  save({ enabled: v }, v ? "Schedule enabled" : "Schedule disabled")
                }
              />
              Enabled
            </span>
          </span>
        </CardTitle>
        <CardDescription>
          {view.currentShift
            ? `Current shift: ${fmt(view.currentShift.start, sc.timezone)} → ${fmt(view.currentShift.end, sc.timezone)}`
            : view.nextShift
              ? `Next shift: ${fmt(view.nextShift.start, sc.timezone)} → ${fmt(view.nextShift.end, sc.timezone)}`
              : "No shifts set."}
          {" · "}
          {view.connectedAccounts.length} connected account(s)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!sc.groupAutomationEnabled && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4" /> Automation is off for this group. Turn it on on the
            Groups page before enabling the schedule.
          </p>
        )}
        {!hasDuty && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4" /> No shifts are set, so nothing will run. Set your
            duty calendar below.
          </p>
        )}
        {view.connectedAccounts.length < 2 && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4" /> At least two connected Telegram accounts are
            needed.
          </p>
        )}

        {progress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>
                This shift: {progress.sent} / {progress.target} messages
              </span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {progress.perAccount.map((a) => (
                <span key={a.name}>
                  {a.name}: {a.sent}/{a.quota}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(counts).map(([k, n]) => (
                <Badge key={k} variant="outline">
                  {k.toLowerCase()}: {n}
                </Badge>
              ))}
              {upcoming.length > 0 && (
                <span className="text-muted-foreground">
                  Next: {upcoming.map((r) => fmt(r.runAt, sc.timezone)).join(" · ")}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-medium">Volume</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor={`pa-${sc.id}`}>Messages per account per 12h shift</Label>
              <Input
                id={`pa-${sc.id}`}
                type="number"
                min={10}
                max={1000}
                value={perAccount}
                onChange={(e) => setPerAccount(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`mn-${sc.id}`}>Min per conversation</Label>
              <Input
                id={`mn-${sc.id}`}
                type="number"
                min={6}
                max={40}
                value={minSize}
                onChange={(e) => setMinSize(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`mx-${sc.id}`}>Max per conversation</Label>
              <Input
                id={`mx-${sc.id}`}
                type="number"
                min={6}
                max={40}
                value={maxSize}
                onChange={(e) => setMaxSize(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`gp-${sc.id}`}>Min gap per account (s)</Label>
              <Input
                id={`gp-${sc.id}`}
                type="number"
                min={5}
                max={600}
                value={gap}
                onChange={(e) => setGap(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`tz-${sc.id}`}>Timezone</Label>
              <Input id={`tz-${sc.id}`} value={tz} onChange={(e) => setTz(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Shorter custom shifts get a proportionally smaller quota. All{" "}
            {view.connectedAccounts.length || 5} accounts together = quota × accounts per shift.
          </p>
          {perAccount > 150 && (
            <p className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4" /> {perAccount} messages per account is a very high
              volume. Telegram may rate-limit or restrict accounts that post this much. Consider
              starting at 50–100 and raising it slowly.
            </p>
          )}
          <Button
            size="sm"
            disabled={update.isPending}
            onClick={() =>
              save({
                messagesPerAccountPerDay: perAccount,
                messagesPerSessionMin: minSize,
                messagesPerSessionMax: maxSize,
                minGapPerAccountSec: gap,
                timezone: tz,
              })
            }
          >
            Save volume settings
          </Button>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Duty calendar ({tz})</p>
          <DutyEditor
            weekly={weekly}
            overrides={overrides}
            onWeekly={setWeekly}
            onOverrides={setOverrides}
          />
          <Button
            size="sm"
            disabled={update.isPending}
            onClick={() =>
              save(
                { weeklyPattern: clean(weekly), dateOverrides: clean(overrides) },
                "Duty calendar saved",
              )
            }
          >
            Save duty calendar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
