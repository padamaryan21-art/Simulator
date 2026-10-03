"use client";

import { Check, ExternalLink, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useKnowledge,
  useKnowledgeMutations,
  type Fact,
  type KnowledgeData,
} from "@/features/knowledge/hooks";
import {
  factCreateSchema,
  pageSchema,
  sourceSchema,
  type FactStatus,
} from "@/validators/knowledge";

const STATUS: Record<
  FactStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  CONFIRMED: { label: "Confirmed", variant: "default" },
  UNKNOWN: { label: "Unverified", variant: "outline" },
  OUTDATED: { label: "Outdated", variant: "destructive" },
};
const ALL = "ALL";

async function run(p: Promise<unknown>, ok?: string) {
  try {
    await p;
    if (ok) toast.success(ok);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Request failed");
  }
}

export function KnowledgeManager() {
  const { data, isLoading, error } = useKnowledge();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error || !data)
    return <p className="text-sm text-destructive">{(error as Error)?.message}</p>;
  const count = (s: FactStatus) => data.facts.filter((f) => f.status === s).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">LakiPH Knowledge</h1>
        <div className="flex gap-2">
          {(Object.keys(STATUS) as FactStatus[]).map((s) => (
            <Badge key={s} variant={STATUS[s].variant}>
              {STATUS[s].label}: {count(s)}
            </Badge>
          ))}
        </div>
      </div>

      <Alert>
        <AlertTitle>The AI only uses Confirmed facts</AlertTitle>
        <AlertDescription>
          Facts extracted from the website start as Unverified. Review each against its source and
          evidence, then confirm it. If a page changes, its confirmed facts become Outdated until
          you re-check them. Anything not confirmed is treated as unknown and never stated.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="facts">
        <TabsList>
          <TabsTrigger value="facts">Facts</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
        </TabsList>
        <TabsContent value="facts" className="pt-4">
          <FactsTab data={data} />
        </TabsContent>
        <TabsContent value="pages" className="pt-4">
          <PagesTab data={data} />
        </TabsContent>
        <TabsContent value="sources" className="pt-4">
          <SourcesTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FactsTab({ data }: { data: KnowledgeData }) {
  const m = useKnowledgeMutations();
  const [filter, setFilter] = useState<string>("UNKNOWN");
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<Fact | null>(null);
  const [adding, setAdding] = useState(false);

  const shown = useMemo(
    () => data.facts.filter((f) => filter === ALL || f.status === filter),
    [data.facts, filter],
  );
  const allPicked = shown.length > 0 && shown.every((f) => picked.includes(f.id));
  const items = [
    { value: ALL, label: "All" },
    ...(Object.keys(STATUS) as FactStatus[]).map((s) => ({ value: s, label: STATUS[s].label })),
  ];

  const bulk = async (status: FactStatus) => {
    await run(
      m.bulkStatus.mutateAsync({ ids: picked, status }),
      `${picked.length} fact(s) marked ${STATUS[status].label.toLowerCase()}`,
    );
    setPicked([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onValueChange={(v) => v && setFilter(v)} items={items}>
          <SelectTrigger className="w-40">
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
        {picked.length > 0 && (
          <>
            <Button size="sm" onClick={() => bulk("CONFIRMED")}>
              <Check className="mr-1 size-3.5" /> Confirm {picked.length}
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk("OUTDATED")}>
              Mark outdated
            </Button>
          </>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={() => setAdding(true)} disabled={!data.sources.length}>
          <Plus className="mr-1 size-3.5" /> Add fact
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allPicked}
                    onCheckedChange={(c) => setPicked(c ? shown.map((f) => f.id) : [])}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Fact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <Checkbox
                      checked={picked.includes(f.id)}
                      onCheckedChange={(c) =>
                        setPicked((cur) => (c ? [...cur, f.id] : cur.filter((x) => x !== f.id)))
                      }
                      aria-label="Select fact"
                    />
                  </TableCell>
                  <TableCell className="max-w-xl space-y-1 whitespace-normal">
                    <p className="text-sm">{f.fact}</p>
                    {f.evidence && (
                      <p className="text-xs text-muted-foreground">
                        Evidence: &ldquo;{f.evidence}&rdquo;
                      </p>
                    )}
                    <a
                      href={f.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                    >
                      <ExternalLink className="size-3" /> {f.sourceUrl}
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS[f.status].variant}>{STATUS[f.status].label}</Badge>
                    {f.verifiedAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(f.verifiedAt).toLocaleDateString()}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    {f.status !== "CONFIRMED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(m.updateFact.mutateAsync({ id: f.id, status: "CONFIRMED" }))
                        }
                      >
                        <Check className="mr-1 size-3.5" /> Confirm
                      </Button>
                    )}
                    {f.status === "CONFIRMED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(m.updateFact.mutateAsync({ id: f.id, status: "OUTDATED" }))
                        }
                      >
                        <X className="mr-1 size-3.5" /> Outdated
                      </Button>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Edit fact"
                      onClick={() => setEditing(f)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete fact"
                      onClick={() =>
                        confirm("Delete this fact?") && run(m.deleteFact.mutateAsync(f.id))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!shown.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No facts here. Refresh a source on the Sources tab to extract some.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EditFactDialog fact={editing} onClose={() => setEditing(null)} />
      <AddFactDialog open={adding} onOpenChange={setAdding} data={data} />
    </div>
  );
}

function EditFactDialog({ fact, onClose }: { fact: Fact | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(fact)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {fact && <EditFactForm key={fact.id} fact={fact} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditFactForm({ fact, onClose }: { fact: Fact; onClose: () => void }) {
  const m = useKnowledgeMutations();
  const [text, setText] = useState(fact.fact);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit fact</DialogTitle>
        <DialogDescription>
          Editing keeps its source. Re-confirm it after changing the wording.
        </DialogDescription>
      </DialogHeader>
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={text.trim().length < 8 || m.updateFact.isPending}
          onClick={async () => {
            await run(
              m.updateFact.mutateAsync({
                id: fact.id,
                fact: text,
                status:
                  fact.status === "CONFIRMED" && text.trim() !== fact.fact ? "UNKNOWN" : undefined,
              }),
            );
            onClose();
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

function AddFactDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: KnowledgeData;
}) {
  const m = useKnowledgeMutations();
  const [sourceId, setSourceId] = useState(data.sources[0]?.id ?? "");
  const [fact, setFact] = useState("");
  const [url, setUrl] = useState("");
  const source = data.sources.find((s) => s.id === sourceId) ?? data.sources[0];
  const items = data.sources.map((s) => ({ value: s.id, label: s.name }));

  const submit = async () => {
    const parsed = factCreateSchema.safeParse({
      sourceId: source?.id,
      fact,
      sourceUrl: url || source?.baseUrl,
      status: "CONFIRMED",
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    await run(m.createFact.mutateAsync(parsed.data), "Fact added as confirmed");
    setFact("");
    setUrl("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a fact</DialogTitle>
          <DialogDescription>
            Entered by you, so it is saved as Confirmed. It must point to the page that states it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select
              value={source?.id ?? ""}
              onValueChange={(v) => v && setSourceId(v)}
              items={items}
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
          <div className="space-y-1.5">
            <Label htmlFor="nf-fact">Fact</Label>
            <Textarea
              id="nf-fact"
              rows={3}
              value={fact}
              onChange={(e) => setFact(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nf-url">Source page URL</Label>
            <Input
              id="nf-url"
              placeholder={source?.baseUrl}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={m.createFact.isPending}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PagesTab({ data }: { data: KnowledgeData }) {
  const m = useKnowledgeMutations();
  const [adding, setAdding] = useState(false);
  const sourceName = (id: string) => data.sources.find((s) => s.id === id)?.name ?? "?";

  const refresh = (id: string) =>
    run(
      m.refreshPage.mutateAsync(id).then((r) => {
        toast.success(
          `${r.proposed} new fact(s) to review${r.outdated ? ` · ${r.outdated} confirmed fact(s) now outdated` : ""}`,
        );
      }),
    );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAdding(true)} disabled={!data.sources.length}>
          <Plus className="mr-1 size-3.5" /> Add page
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead>How fetched</TableHead>
                <TableHead>Last fetched</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.pages.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-md whitespace-normal">
                    <p className="text-sm font-medium">{p.title ?? p.url}</p>
                    <p className="text-xs text-muted-foreground">
                      {sourceName(p.sourceId)} · {p.url} · {p.contentLength.toLocaleString()} chars
                    </p>
                    {p.lastError && <p className="text-xs text-destructive">{p.lastError}</p>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.fetchMode ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.fetchedAt ? new Date(p.fetchedAt).toLocaleString() : "never"}
                  </TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={p.fetchMode === "MANUAL" || m.refreshPage.isPending}
                      onClick={() => refresh(p.id)}
                    >
                      <RefreshCw
                        className={`mr-1 size-3.5 ${m.refreshPage.isPending && m.refreshPage.variables === p.id ? "animate-spin" : ""}`}
                      />
                      Refresh
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete page"
                      onClick={() =>
                        confirm("Delete this page? Its facts are kept.") &&
                        run(m.deletePage.mutateAsync(p.id))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!data.pages.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No pages yet. Refresh a source or add a page.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <AddPageDialog open={adding} onOpenChange={setAdding} data={data} />
    </div>
  );
}

function AddPageDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: KnowledgeData;
}) {
  const m = useKnowledgeMutations();
  const [sourceId, setSourceId] = useState(data.sources[0]?.id ?? "");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const source = data.sources.find((s) => s.id === sourceId) ?? data.sources[0];
  const items = data.sources.map((s) => ({ value: s.id, label: s.name }));

  const submit = async () => {
    const parsed = pageSchema.safeParse({
      sourceId: source?.id,
      url: url || source?.baseUrl,
      content: content.trim() || undefined,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    await run(
      m.addPage.mutateAsync(parsed.data).then((r) => {
        toast.success(`Page added (${r.mode.toLowerCase()}). ${r.proposed} fact(s) to review.`);
      }),
    );
    setUrl("");
    setContent("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add page</DialogTitle>
          <DialogDescription>
            The page must be on the source&apos;s site. JavaScript sites are rendered in a headless
            browser, which can take up to a minute.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select
              value={source?.id ?? ""}
              onValueChange={(v) => v && setSourceId(v)}
              items={items}
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
          <div className="space-y-1.5">
            <Label htmlFor="np-url">Page URL</Label>
            <Input
              id="np-url"
              placeholder={source?.baseUrl}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-content">Or paste the page text (optional)</Label>
            <Textarea
              id="np-content"
              rows={5}
              placeholder="Use this when a page cannot be fetched. Copy the visible text from your browser."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={m.addPage.isPending}>
            {m.addPage.isPending ? "Working…" : "Add page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourcesTab({ data }: { data: KnowledgeData }) {
  const m = useKnowledgeMutations();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const add = async () => {
    const parsed = sourceSchema.safeParse({ name, baseUrl });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    await run(m.addSource.mutateAsync(parsed.data), "Source added");
    setName("");
    setBaseUrl("");
  };

  const refresh = (id: string) =>
    run(
      m.refreshSource.mutateAsync(id).then(({ results }) => {
        const failed = results.filter((r) => !r.ok);
        const proposed = results.reduce((n, r) => n + (r.proposed ?? 0), 0);
        if (failed.length) toast.error(failed[0].error ?? "Some pages failed");
        if (proposed || !failed.length)
          toast.success(`${proposed} new fact(s) to review on the Facts tab`);
      }),
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="divide-y p-0">
          {data.sources.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-muted-foreground">
                  {s.baseUrl} ·{" "}
                  {s.lastRefreshedAt
                    ? `refreshed ${new Date(s.lastRefreshedAt).toLocaleString()}`
                    : "never refreshed"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => refresh(s.id)}
                  disabled={m.refreshSource.isPending}
                >
                  <RefreshCw
                    className={`mr-1 size-3.5 ${m.refreshSource.isPending && m.refreshSource.variables === s.id ? "animate-spin" : ""}`}
                  />
                  {m.refreshSource.isPending && m.refreshSource.variables === s.id
                    ? "Refreshing…"
                    : "Refresh & extract"}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Delete source"
                  onClick={() =>
                    confirm(`Delete "${s.name}" with all its pages and facts?`) &&
                    run(m.deleteSource.mutateAsync(s.id))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {!data.sources.length && (
            <p className="px-6 py-4 text-sm text-muted-foreground">No sources yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="ns-name">Name</Label>
            <Input id="ns-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label htmlFor="ns-url">Base URL</Label>
            <Input
              id="ns-url"
              placeholder="https://www.example.com/"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <Button onClick={add} disabled={m.addSource.isPending}>
            <Plus className="mr-1 size-4" /> Add source
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
