"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BulkCard } from "./bulk-card";
import { RealCommunityWarning } from "@/components/telegram/groups-manager";
import { useCreateConversation, useSessions, useTopics } from "@/features/conversations/hooks";
import { usePersonas } from "@/features/personas/hooks";
import { useGroups } from "@/features/telegram/hooks";
import { CONVERSATION_MODES } from "@/validators/conversations";

const AUTO_TOPIC = "__auto__";
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
  const router = useRouter();
  const { data: groups } = useGroups();
  const { data: personas } = usePersonas();
  const { data: topicData } = useTopics();
  const { data: sessions } = useSessions();
  const create = useCreateConversation();

  const [groupId, setGroupId] = useState("");
  // Per-group overrides; groups without an entry default to all active members.
  const [pickedByGroup, setPickedByGroup] = useState<Record<string, string[]>>({});
  const [topicId, setTopicId] = useState(AUTO_TOPIC);
  const [requestedMode, setMode] = useState<(typeof CONVERSATION_MODES)[number]>("PREVIEW");
  const [count, setCount] = useState(12);
  const [instruction, setInstruction] = useState("");
  const [requestedPage, setPage] = useState(1);

  const total = sessions?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const pageStart = (page - 1) * PAGE_SIZE;

  const activeGroups = groups?.filter((g) => g.active) ?? [];
  const group = activeGroups.find((g) => g.id === groupId) ?? activeGroups[0];
  const members = (group?.participantIds ?? [])
    .map((id) => personas?.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.active);
  const real = group?.type === "REAL_COMMUNITY";
  const automaticOk = group?.type === "PRIVATE_SIMULATION" && group.automationEnabled;

  const picked = (group && pickedByGroup[group.id]) ?? members.map((m) => m.id);
  const setPicked = (fn: (cur: string[]) => string[]) =>
    group && setPickedByGroup((all) => ({ ...all, [group.id]: fn(picked) }));
  // Automatic mode is only valid for automation-enabled private groups.
  const mode = requestedMode === "AUTOMATIC" && !automaticOk ? "PREVIEW" : requestedMode;

  const generate = async () => {
    if (!group) return;
    try {
      const res = await create.mutateAsync({
        groupId: group.id,
        participantIds: picked,
        topicId: topicId === AUTO_TOPIC ? null : topicId,
        mode,
        messageCount: count,
        instruction: instruction.trim() || undefined,
      });
      if (res.warnings.length)
        toast.warning(
          `Generated with ${res.warnings.length} quality note(s). Review before approving.`,
        );
      else toast.success("Conversation generated");
      router.push(`/ai/simulator/${res.sessionId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    }
  };

  const groupItems = activeGroups.map((g) => ({ value: g.id, label: g.name }));
  const topicItems = [
    { value: AUTO_TOPIC, label: "Auto (topic engine picks)" },
    ...(topicData?.topics.filter((t) => t.active).map((t) => ({ value: t.id, label: t.title })) ??
      []),
  ];
  const modeItems = CONVERSATION_MODES.map((m) => ({
    value: m,
    label:
      m === "PREVIEW"
        ? "Preview (generate only)"
        : m === "MANUAL"
          ? "Manual (approve, then send)"
          : "Automatic (private only)",
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Simulator</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New conversation</CardTitle>
          <CardDescription>
            Pick a group, participants and topic. Nothing is sent until you approve it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select
                value={group?.id ?? ""}
                onValueChange={(v) => v && setGroupId(v)}
                items={groupItems}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {groupItems.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Topic</Label>
              <Select value={topicId} onValueChange={(v) => v && setTopicId(v)} items={topicItems}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {topicItems.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select
                value={mode}
                onValueChange={(v) => v && setMode(v as typeof mode)}
                items={modeItems}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modeItems.map((i) => (
                    <SelectItem
                      key={i.value}
                      value={i.value}
                      disabled={i.value === "AUTOMATIC" && !automaticOk}
                    >
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {real && <RealCommunityWarning />}

          <div className="space-y-1.5">
            <Label>Participants</Label>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This group has no active participants. Add some on the Groups page.
              </p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {members.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={picked.includes(p.id)}
                      onCheckedChange={(c) =>
                        setPicked((cur) => (c ? [...cur, p.id] : cur.filter((x) => x !== p.id)))
                      }
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <Label htmlFor="count">Number of messages</Label>
              <span className="text-muted-foreground">{count}</span>
            </div>
            <input
              id="count"
              type="range"
              min={6}
              max={30}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instr">Extra instruction (optional)</Label>
            <Textarea
              id="instr"
              rows={2}
              placeholder="e.g. Mas maikli ang mga mensahe, may konting asaran."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </div>

          <Button onClick={generate} disabled={create.isPending || picked.length < 2 || !group}>
            <Sparkles className="mr-1.5 size-4" />
            {create.isPending ? "Generating… (can take up to a minute)" : "Generate conversation"}
          </Button>
        </CardContent>
      </Card>

      {group?.type === "PRIVATE_SIMULATION" && (
        <BulkCard groupId={group.id} participantIds={members.map((m) => m.id)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent conversations</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {sessions?.slice(pageStart, pageStart + PAGE_SIZE).map((s, i) => (
            <Link
              key={s.id}
              href={`/ai/simulator/${s.id}`}
              className="flex items-center justify-between gap-3 px-6 py-3 text-sm hover:bg-accent/50"
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
