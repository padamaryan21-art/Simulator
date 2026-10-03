"use client";

import { AlertTriangle, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EditGroupDialog } from "./edit-group-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  useAccounts,
  useGroupMutations,
  useGroups,
  usePersonaOptions,
} from "@/features/telegram/hooks";
import type { GroupWithParticipants } from "@/server/groups/groups";
import { createGroupSchema, GROUP_TYPES } from "@/validators/telegram";

export function RealCommunityWarning() {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertTitle>REAL COMMUNITY</AlertTitle>
      <AlertDescription>Messages require human approval before sending.</AlertDescription>
    </Alert>
  );
}

export function GroupsManager() {
  const { data: groups, isLoading } = useGroups();
  const { data: personas } = usePersonaOptions();
  const { data: accounts } = useAccounts();
  const m = useGroupMutations();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<GroupWithParticipants | null>(null);
  const [resolveAccount, setResolveAccount] = useState<string>("");

  const connected = accounts?.filter((a) => a.status === "CONNECTED") ?? [];
  const personaName = (id: string) => personas?.find((p) => p.id === id)?.name ?? "?";

  const run = async (p: Promise<unknown>, ok?: string) => {
    try {
      await p;
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    }
  };

  const resolve = async (g: GroupWithParticipants) => {
    const accountId = resolveAccount || connected[0]?.id;
    if (!accountId) return toast.error("Connect a Telegram account first");
    await run(
      m.resolve.mutateAsync({ id: g.id, accountId }).then((r) => {
        if (!r.chatId) throw new Error("Could not resolve: join the group with that account first");
        toast.success(`Resolved: ${r.title ?? r.chatId}`);
      }),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Telegram Groups</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 size-4" /> Add group
        </Button>
      </div>

      {connected.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Resolve links using:</span>
          <Select
            value={resolveAccount || connected[0].id}
            onValueChange={(v) => setResolveAccount(v ?? "")}
            items={connected.map((a) => ({ value: a.id, label: a.displayName }))}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {connected.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {groups?.map((g) => {
          const real = g.type === "REAL_COMMUNITY";
          return (
            <Card key={g.id} className={real ? "border-destructive/50" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  {g.name}
                  <Badge variant={real ? "destructive" : "secondary"}>
                    {real ? "REAL COMMUNITY" : "PRIVATE SIMULATION"}
                  </Badge>
                </CardTitle>
                <CardDescription>{g.purpose || "No description"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {real && <RealCommunityWarning />}
                {g.url && (
                  <p className="text-muted-foreground">
                    {g.url} · chat id: {g.telegramChatId ?? "not resolved"}
                  </p>
                )}
                {g.participantIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {g.participantIds.map((id) => (
                      <Badge key={id} variant="outline">
                        {personaName(id)}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <Label htmlFor={`active-${g.id}`}>Active</Label>
                  <Switch
                    id={`active-${g.id}`}
                    checked={g.active}
                    onCheckedChange={(v) =>
                      run(m.update.mutateAsync({ id: g.id, data: { active: v } }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor={`auto-${g.id}`}>
                    Automation{" "}
                    {real && (
                      <span className="text-muted-foreground">(disabled for real community)</span>
                    )}
                  </Label>
                  <Switch
                    id={`auto-${g.id}`}
                    checked={g.automationEnabled}
                    disabled={real}
                    onCheckedChange={(v) =>
                      run(m.update.mutateAsync({ id: g.id, data: { automationEnabled: v } }))
                    }
                  />
                </div>
                <div className="flex justify-end gap-2">
                  {g.url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolve(g)}
                      disabled={m.resolve.isPending}
                    >
                      <Link2 className="mr-1 size-3.5" /> Resolve link
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEditing(g)}>
                    <Pencil className="mr-1 size-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      confirm(`Delete group "${g.name}"?`) && run(m.remove.mutateAsync(g.id))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <EditGroupDialog
        group={editing}
        personas={(personas ?? []).map((p) => ({ id: p.id, name: p.name }))}
        onClose={() => setEditing(null)}
      />
      <CreateGroupDialog
        open={creating}
        onOpenChange={setCreating}
        personas={personas ?? []}
        onCreate={(input) => m.create.mutateAsync(input)}
        pending={m.create.isPending}
      />
    </div>
  );
}

function CreateGroupDialog({
  open,
  onOpenChange,
  personas,
  onCreate,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  personas: { id: string; name: string }[];
  onCreate: (input: ReturnType<typeof createGroupSchema.parse>) => Promise<unknown>;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<(typeof GROUP_TYPES)[number]>("PRIVATE_SIMULATION");
  const [purpose, setPurpose] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const parsed = createGroupSchema.safeParse({
      name,
      url: url || null,
      type,
      purpose,
      automationEnabled: false,
      requiresApproval: true,
      participantIds: picked,
    });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    try {
      await onCreate(parsed.data);
      toast.success("Group added");
      setName("");
      setUrl("");
      setPurpose("");
      setPicked([]);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add group</DialogTitle>
          <DialogDescription>New groups start with automation off.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-name">Name</Label>
            <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => v && setType(v as typeof type)}
              items={GROUP_TYPES.map((t) => ({ value: t, label: t.replace("_", " ") }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === "REAL_COMMUNITY" && <RealCommunityWarning />}
          <div className="space-y-1.5">
            <Label htmlFor="g-url">Telegram link (optional)</Label>
            <Input
              id="g-url"
              placeholder="https://t.me/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-purpose">Purpose</Label>
            <Textarea id="g-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          {personas.length > 0 && (
            <div className="space-y-1.5">
              <Label>Participants</Label>
              <div className="grid grid-cols-2 gap-2">
                {personas.map((p) => (
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
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            Add group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
