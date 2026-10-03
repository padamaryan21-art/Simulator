"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useMemories,
  useMemoryMutations,
  usePersonas,
  useRelationships,
} from "@/features/personas/hooks";
import { useGroups } from "@/features/telegram/hooks";
import type { MemoryRecord } from "@/server/memory/memory";
import { MEMORY_SCOPES, type MemoryScope } from "@/validators/personas";

const SCOPE_LABEL: Record<MemoryScope, string> = {
  persona: "Persona",
  relationship: "Relationship",
  group: "Group",
};
const ALL = "__all__";

export function MemoriesManager() {
  const [scope, setScope] = useState<MemoryScope>("persona");
  const [owner, setOwner] = useState<string>(ALL);
  const { data: personas } = usePersonas();
  const { data: rels } = useRelationships();
  const { data: groups } = useGroups();

  const personaName = (id: string) => personas?.find((p) => p.id === id)?.name ?? "?";
  const owners: { value: string; label: string }[] =
    scope === "persona"
      ? (personas ?? []).map((p) => ({ value: p.id, label: p.name }))
      : scope === "relationship"
        ? (rels ?? []).map((r) => ({
            value: r.id,
            label: `${personaName(r.personaAId)} ↔ ${personaName(r.personaBId)}`,
          }))
        : (groups ?? []).map((g) => ({ value: g.id, label: g.name }));
  const ownerLabel = (id: string) => owners.find((o) => o.value === id)?.label ?? "?";

  const ownerId = owner === ALL ? undefined : owner;
  const { data: memories, isLoading } = useMemories(scope, ownerId);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Memories</h1>
      <p className="text-sm text-muted-foreground">
        Long-term facts Claude recalls in private simulations. Review, edit or delete anything here.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={scope}
          onValueChange={(v) => {
            setScope(v as MemoryScope);
            setOwner(ALL);
          }}
        >
          <TabsList>
            {MEMORY_SCOPES.map((s) => (
              <TabsTrigger key={s} value={s}>
                {SCOPE_LABEL[s]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select
          value={owner}
          onValueChange={(v) => setOwner(v ?? ALL)}
          items={[{ value: ALL, label: "All" }, ...owners]}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            {owners.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AddMemory scope={scope} owners={owners} defaultOwner={ownerId} />

      <Card>
        <CardContent className="divide-y p-0">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {memories?.map((mem) => (
            <MemoryRow key={mem.id} memory={mem} ownerLabel={ownerLabel(mem.ownerId)} />
          ))}
          {!isLoading && !memories?.length && (
            <p className="p-4 text-sm text-muted-foreground">No memories here yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddMemory({
  scope,
  owners,
  defaultOwner,
}: {
  scope: MemoryScope;
  owners: { value: string; label: string }[];
  defaultOwner?: string;
}) {
  const m = useMemoryMutations();
  const [picked, setPicked] = useState<string>("");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState(3);
  const ownerId = defaultOwner ?? (picked || owners[0]?.value);

  const add = async () => {
    if (!ownerId) return toast.error(`Create a ${SCOPE_LABEL[scope].toLowerCase()} first`);
    if (!content.trim()) return;
    try {
      await m.create.mutateAsync({ scope, ownerId, content, importance });
      setContent("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add memory");
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start gap-2 p-4">
        {!defaultOwner && (
          <Select value={ownerId ?? ""} onValueChange={(v) => setPicked(v ?? "")} items={owners}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder={`Select ${SCOPE_LABEL[scope].toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {owners.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Textarea
          className="min-w-64 flex-1"
          rows={2}
          placeholder="e.g. Nagkwento si Jennelyn na lumipat sila ng bahay last month."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <Input
          type="number"
          min={1}
          max={5}
          className="w-20"
          title="Importance (1-5)"
          value={importance}
          onChange={(e) => setImportance(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
        />
        <Button onClick={add} disabled={m.create.isPending}>
          <Plus className="mr-1 size-4" /> Add
        </Button>
      </CardContent>
    </Card>
  );
}

function MemoryRow({ memory, ownerLabel }: { memory: MemoryRecord; ownerLabel: string }) {
  const m = useMemoryMutations();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memory.content);
  const [importance, setImportance] = useState(memory.importance);

  const save = async () => {
    try {
      await m.update.mutateAsync({ scope: memory.scope, id: memory.id, content, importance });
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const remove = async () => {
    if (!confirm("Delete this memory?")) return;
    try {
      await m.remove.mutateAsync({ scope: memory.scope, id: memory.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="flex items-start gap-3 p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{ownerLabel}</Badge>
          <span>importance {memory.importance}</span>
          <span>{new Date(memory.createdAt).toLocaleString()}</span>
          {memory.sourceSessionId && <Badge variant="secondary">auto</Badge>}
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Textarea rows={2} value={content} onChange={(e) => setContent(e.target.value)} />
            <Input
              type="number"
              min={1}
              max={5}
              className="w-20"
              value={importance}
              onChange={(e) => setImportance(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
        ) : (
          <p className="text-sm">{memory.content}</p>
        )}
      </div>
      <div className="flex gap-1">
        {editing ? (
          <>
            <Button size="icon-sm" variant="ghost" aria-label="Save" onClick={save}>
              <Check className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Cancel"
              onClick={() => setEditing(false)}
            >
              <X className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Edit"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Delete" onClick={remove}>
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
