"use client";

import { Pause, Play, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAutomation, useAutomationControl } from "@/features/conversations/hooks";

type Action = "start" | "pause" | "resume" | "stop";

export function AutomationControls() {
  const { data } = useAutomation();
  const control = useAutomationControl();
  const state = data?.state ?? "STOPPED";

  const run = async (action: Action) => {
    if (action === "stop" && !confirm("STOP ALL? Automated sends will be cancelled immediately."))
      return;
    try {
      const res = await control.mutateAsync(action);
      toast.success(
        action === "stop" && res.cancelledSessions
          ? `Stopped. Cancelled ${res.cancelledSessions} automated conversation(s).`
          : `Automation ${res.state.toLowerCase()}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const busy = control.isPending;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant={state === "RUNNING" ? "default" : state === "PAUSED" ? "outline" : "secondary"}
      >
        Automation: {state}
      </Badge>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || state === "RUNNING"}
        onClick={() => run("start")}
      >
        <Play className="mr-1 size-3.5" /> START ALL
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || state !== "RUNNING"}
        onClick={() => run("pause")}
      >
        <Pause className="mr-1 size-3.5" /> PAUSE ALL
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || state !== "PAUSED"}
        onClick={() => run("resume")}
      >
        <RotateCcw className="mr-1 size-3.5" /> RESUME ALL
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={busy || state === "STOPPED"}
        onClick={() => run("stop")}
      >
        <Square className="mr-1 size-3.5" /> STOP ALL
      </Button>
    </div>
  );
}
