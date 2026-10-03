"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useGroupMutations } from "@/features/telegram/hooks";
import type { GroupWithParticipants } from "@/server/groups/groups";
import { updateGroupSchema } from "@/validators/telegram";

export function EditGroupDialog({
  group,
  personas,
  onClose,
}: {
  group: GroupWithParticipants | null;
  personas: { id: string; name: string }[];
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(group)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {group && <EditForm key={group.id} group={group} personas={personas} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  group,
  personas,
  onClose,
}: {
  group: GroupWithParticipants;
  personas: { id: string; name: string }[];
  onClose: () => void;
}) {
  const m = useGroupMutations();
  const [name, setName] = useState(group.name);
  const [url, setUrl] = useState(group.url ?? "");
  const [purpose, setPurpose] = useState(group.purpose);
  const [picked, setPicked] = useState<string[]>(group.participantIds);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    // Send only what changed, so nothing else on the group is touched.
    const patch: Record<string, unknown> = {};
    if (name.trim() !== group.name) patch.name = name;
    if (purpose.trim() !== group.purpose) patch.purpose = purpose;
    const newUrl = url.trim() || null;
    if (newUrl !== group.url) {
      patch.url = newUrl;
      patch.telegramChatId = null; // the old chat id belongs to the old link; resolve again
    }
    const same =
      picked.length === group.participantIds.length &&
      picked.every((id) => group.participantIds.includes(id));
    if (!same) patch.participantIds = picked;

    if (!Object.keys(patch).length) return onClose();
    const parsed = updateGroupSchema.safeParse(patch);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    try {
      await m.update.mutateAsync({ id: group.id, data: parsed.data });
      toast.success("Group saved");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit group</DialogTitle>
        <DialogDescription>
          The group type and the automation/approval rules are not editable here.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="eg-name">Name</Label>
          <Input id="eg-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eg-url">Telegram link</Label>
          <Input
            id="eg-url"
            placeholder="https://t.me/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Changing the link clears the resolved chat; click Resolve link again afterwards.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eg-purpose">Purpose</Label>
          <Textarea
            id="eg-purpose"
            rows={2}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </div>
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
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={m.update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
