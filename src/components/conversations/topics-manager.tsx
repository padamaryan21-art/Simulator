"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
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
  useTopicMutations,
  useTopics,
  type Topic,
  type TopicCategory,
} from "@/features/conversations/hooks";
import { topicSchema } from "@/validators/topics";

export function TopicsManager() {
  const { data, isLoading } = useTopics();
  const m = useTopicMutations();
  const [editing, setEditing] = useState<Topic | null>(null);
  const [open, setOpen] = useState(false);

  const cat = (id: string) => data?.categories.find((c) => c.id === id)?.label ?? "?";
  const openEditor = (t: Topic | null) => {
    setEditing(t);
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
        <h1 className="text-2xl font-semibold">Topics</h1>
        <Button onClick={() => openEditor(null)}>
          <Plus className="mr-1.5 size-4" /> New topic
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        The topic engine picks active topics that are off cooldown, weighted by priority.
      </p>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Cooldown</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.topics.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{cat(t.categoryId)}</Badge>
                  </TableCell>
                  <TableCell>{t.priority}</TableCell>
                  <TableCell>{t.cooldownMinutes} min</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "never"}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={t.active}
                      aria-label="Toggle active"
                      onCheckedChange={(v) =>
                        run(m.update.mutateAsync({ id: t.id, data: { active: v } }))
                      }
                    />
                  </TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    <Button size="sm" variant="outline" onClick={() => openEditor(t)}>
                      <Pencil className="mr-1 size-3.5" /> Edit
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete topic"
                      onClick={() =>
                        confirm(`Delete "${t.title}"?`) && run(m.remove.mutateAsync(t.id))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && !data?.topics.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No topics yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {open && (
            <TopicForm
              key={editing?.id ?? "new"}
              topic={editing}
              categories={data?.categories ?? []}
              onClose={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TopicForm({
  topic,
  categories,
  onClose,
}: {
  topic: Topic | null;
  categories: TopicCategory[];
  onClose: () => void;
}) {
  const m = useTopicMutations();
  const [categoryId, setCategoryId] = useState(topic?.categoryId ?? categories[0]?.id ?? "");
  const [title, setTitle] = useState(topic?.title ?? "");
  const [description, setDescription] = useState(topic?.description ?? "");
  const [promptSeed, setPromptSeed] = useState(topic?.promptSeed ?? "");
  const [priority, setPriority] = useState(topic?.priority ?? 5);
  const [cooldown, setCooldown] = useState(topic?.cooldownMinutes ?? 240);
  const [error, setError] = useState<string | null>(null);
  const items = categories.map((c) => ({ value: c.id, label: c.label }));

  const submit = async () => {
    setError(null);
    const parsed = topicSchema.safeParse({
      categoryId,
      title,
      description,
      promptSeed,
      priority,
      cooldownMinutes: cooldown,
      active: topic?.active ?? true,
    });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    try {
      if (topic) await m.update.mutateAsync({ id: topic.id, data: parsed.data });
      else await m.create.mutateAsync(parsed.data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{topic ? "Edit topic" : "New topic"}</DialogTitle>
        <DialogDescription>
          The prompt seed steers Claude without scripting the conversation.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="t-title">Title</Label>
          <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={categoryId} onValueChange={(v) => v && setCategoryId(v)} items={items}>
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
        <div className="space-y-1.5">
          <Label htmlFor="t-desc">Description</Label>
          <Textarea
            id="t-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-seed">Prompt seed</Label>
          <Textarea
            id="t-seed"
            rows={3}
            value={promptSeed}
            onChange={(e) => setPromptSeed(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-pri">Priority (1-10)</Label>
            <Input
              id="t-pri"
              type="number"
              min={1}
              max={10}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-cd">Cooldown (minutes)</Label>
            <Input
              id="t-cd"
              type="number"
              min={0}
              value={cooldown}
              onChange={(e) => setCooldown(Number(e.target.value))}
            />
          </div>
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
