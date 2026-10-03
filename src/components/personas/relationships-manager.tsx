"use client";

import { ArrowLeftRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  usePersonas,
  useRelationshipMutations,
  useRelationships,
  type Relationship,
} from "@/features/personas/hooks";
import { relationshipSchema } from "@/validators/personas";

export function RelationshipsManager() {
  const { data: rels, isLoading } = useRelationships();
  const { data: personas } = usePersonas();
  const m = useRelationshipMutations();
  const [editing, setEditing] = useState<Relationship | null>(null);
  const [open, setOpen] = useState(false);

  const name = (id: string) => personas?.find((p) => p.id === id)?.name ?? "?";
  const openEditor = (r: Relationship | null) => {
    setEditing(r);
    setOpen(true);
  };

  const run = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Relationships</h1>
        <Button onClick={() => openEditor(null)} disabled={(personas?.length ?? 0) < 2}>
          <Plus className="mr-1.5 size-4" /> New relationship
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Between</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Familiarity</TableHead>
                <TableHead>Tone</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rels?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {name(r.personaAId)}{" "}
                    <ArrowLeftRight className="mx-1 inline size-3.5 text-muted-foreground" />{" "}
                    {name(r.personaBId)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.relationshipType}</Badge>
                  </TableCell>
                  <TableCell>{r.familiarity}/100</TableCell>
                  <TableCell>{r.tone}</TableCell>
                  <TableCell>
                    <Switch
                      checked={r.active}
                      aria-label="Toggle active"
                      onCheckedChange={(v) =>
                        run(m.update.mutateAsync({ id: r.id, data: { active: v } }))
                      }
                    />
                  </TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    <Button size="sm" variant="outline" onClick={() => openEditor(r)}>
                      <Pencil className="mr-1 size-3.5" /> Edit
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete relationship"
                      onClick={() =>
                        confirm("Delete this relationship and its memories?") &&
                        run(m.remove.mutateAsync(r.id))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && !rels?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No relationships yet. They tell Claude how two personas talk to each other.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RelationshipDialog
        open={open}
        relationship={editing}
        personas={personas?.map((p) => ({ id: p.id, name: p.name })) ?? []}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

function RelationshipDialog({
  open,
  relationship,
  personas,
  onClose,
}: {
  open: boolean;
  relationship: Relationship | null;
  personas: { id: string; name: string }[];
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {open && (
          <RelationshipForm
            key={relationship?.id ?? "new"}
            relationship={relationship}
            personas={personas}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RelationshipForm({
  relationship,
  personas,
  onClose,
}: {
  relationship: Relationship | null;
  personas: { id: string; name: string }[];
  onClose: () => void;
}) {
  const m = useRelationshipMutations();
  const [a, setA] = useState(relationship?.personaAId ?? personas[0]?.id ?? "");
  const [b, setB] = useState(relationship?.personaBId ?? personas[1]?.id ?? "");
  const [type, setType] = useState(relationship?.relationshipType ?? "friends");
  const [familiarity, setFamiliarity] = useState(relationship?.familiarity ?? 50);
  const [tone, setTone] = useState(relationship?.tone ?? "casual");
  const [notes, setNotes] = useState(relationship?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const items = personas.map((p) => ({ value: p.id, label: p.name }));

  const submit = async () => {
    setError(null);
    const parsed = relationshipSchema.safeParse({
      personaAId: a,
      personaBId: b,
      relationshipType: type,
      familiarity,
      tone,
      notes,
      active: relationship?.active ?? true,
    });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    try {
      if (relationship) {
        const { relationshipType, familiarity, tone, notes, active } = parsed.data;
        await m.update.mutateAsync({
          id: relationship.id,
          data: { relationshipType, familiarity, tone, notes, active },
        });
      } else {
        await m.create.mutateAsync(parsed.data);
      }
      toast.success("Relationship saved");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const picker = (label: string, value: string, set: (v: string) => void) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value}
        onValueChange={(v) => v && set(v)}
        items={items}
        disabled={Boolean(relationship)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{relationship ? "Edit relationship" : "New relationship"}</DialogTitle>
        <DialogDescription>Applies in both directions between the two personas.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {picker("Persona A", a, setA)}
          {picker("Persona B", b, setB)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="r-type">Relationship type</Label>
            <Input
              id="r-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="friends, cousins…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-tone">Tone</Label>
            <Input
              id="r-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="teasing, respectful…"
            />
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <Label htmlFor="r-fam">Familiarity</Label>
            <span className="text-muted-foreground">{familiarity}</span>
          </div>
          <input
            id="r-fam"
            type="range"
            min={0}
            max={100}
            value={familiarity}
            onChange={(e) => setFamiliarity(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-notes">Notes</Label>
          <Textarea
            id="r-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={m.create.isPending || m.update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
