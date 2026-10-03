"use client";

import {
  BookText,
  ChevronDown,
  ChevronUp,
  Copy,
  CopyPlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePersonas } from "@/features/personas/hooks";
import { usePromptLibrary, usePromptMutations } from "@/features/prompts/hooks";
import {
  buildPrompt,
  CONTINUE_MESSAGE,
  promptStats,
  resumeMessage,
  specProblem,
  type PromptSpec,
  type Situation,
} from "@/lib/prompts/build";

type Entry = PromptSpec & { id: string; description: string; builtin: boolean };

const toLines = (s: Situation[]) => s.map((x) => `${x.label}: ${x.detail}`).join("\n");

function parseSituations(text: string): Situation[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(":");
      return i > 0
        ? { label: l.slice(0, i).trim(), detail: l.slice(i + 1).trim() || l.slice(0, i).trim() }
        : { label: l.slice(0, 80), detail: l };
    });
}

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Could not copy. Select the text and copy it by hand.");
  }
};

type FormState = {
  title: string;
  topic: string;
  description: string;
  situations: string;
  notes: string;
  conversations: number;
  linesMin: number;
  linesMax: number;
  batchSize: number;
};

const EMPTY: FormState = {
  title: "",
  topic: "",
  description: "",
  situations: "",
  notes: "",
  conversations: 80,
  linesMin: 26,
  linesMax: 36,
  batchSize: 5,
};

export function PromptLibrary() {
  const { data, isLoading } = usePromptLibrary();
  const { data: personas } = usePersonas();
  const m = usePromptMutations();
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const cast = useMemo(
    () =>
      (personas ?? [])
        .filter((p) => p.active)
        .map((p) => ({
          name: p.name,
          personality: p.personality,
          languageStyle: p.languageStyle,
          occupation: p.occupation,
          messageLength: p.messageLength,
          commonExpressions: p.commonExpressions,
        })),
    [personas],
  );

  const entries: Entry[] = [
    ...(data?.custom ?? []).map((c) => ({
      ...c,
      situations: c.situations,
      notes: c.notes || undefined,
      builtin: false,
    })),
    ...(data?.builtin ?? []).map((b) => ({ ...b, builtin: true })),
  ];

  const spec = form
    ? {
        ...form,
        situations: parseSituations(form.situations),
        notes: form.notes || undefined,
      }
    : null;
  const problem = spec ? specProblem(spec) : null;

  const startNew = (from?: Entry) => {
    setEditing(null);
    setForm(
      from
        ? {
            title: from.builtin ? `${from.title} (my copy)` : from.title,
            topic: from.topic,
            description: from.description,
            situations: toLines(from.situations),
            notes: from.notes ?? "",
            conversations: from.conversations,
            linesMin: from.linesMin,
            linesMax: from.linesMax,
            batchSize: from.batchSize,
          }
        : EMPTY,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startEdit = (e: Entry) => {
    startNew(e);
    setEditing(e.id);
    setForm((f) => (f ? { ...f, title: e.title } : f));
  };

  const save = async () => {
    if (!spec || !form) return;
    if (problem) return toast.error(problem);
    const payload = {
      title: form.title,
      topic: form.topic,
      description: form.description,
      situations: spec.situations,
      notes: form.notes,
      conversations: form.conversations,
      linesMin: form.linesMin,
      linesMax: form.linesMax,
      batchSize: form.batchSize,
    };
    try {
      if (editing) await m.update.mutateAsync({ id: editing, patch: payload });
      else await m.create.mutateAsync(payload);
      toast.success(editing ? "Prompt saved" : "Prompt added to the library");
      setForm(null);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the prompt");
    }
  };

  const num = (key: keyof FormState, label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`p-${key}`}>{label}</Label>
      <Input
        id={`p-${key}`}
        type="number"
        value={form ? (form[key] as number) : 0}
        onChange={(ev) => setForm((f) => (f ? { ...f, [key]: Number(ev.target.value) } : f))}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Prompt library</h1>
        <Button onClick={() => startNew()}>
          <Plus className="mr-1.5 size-4" /> New prompt
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Ready-made prompts for ChatGPT. Each one asks for{" "}
        <strong>80 conversations and 2,000+ chat lines</strong> on its own topic, written for your
        personas, in the exact format the{" "}
        <Link href="/ai/import" className="underline">
          Import conversations
        </Link>{" "}
        page reads.
      </p>

      {cast.length === 0 && !isLoading && (
        <Alert variant="destructive">
          <AlertTitle>No active personas</AlertTitle>
          <AlertDescription>
            The prompts are written for your personas.{" "}
            <Link href="/ai/personas" className="underline">
              Add or activate them first
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to use a prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p>
            1. Open a <strong>new chat</strong> in ChatGPT (one prompt per chat) and paste the
            prompt.
          </p>
          <p>
            2. ChatGPT cannot write 2,000 lines in one reply, so it writes{" "}
            <strong>5 conversations at a time</strong> as a CSV block. After each reply type{" "}
            <code>{CONTINUE_MESSAGE}</code> until it says <code>DONE</code>.
          </p>
          <p>
            3. Copy every CSV block, in order, into one file (Notepad saved as <code>.csv</code>, or
            paste into Excel). The header row appears once, in the first batch only.
          </p>
          <p>
            4. Upload that file in <strong>Import conversations</strong>. The page flags risky lines
            shows the total number of lines (aim for 2,000 or more; if it is lower, run another
            prompt) and shows who is speaking before anything is saved. Nothing is sent until you
            approve and schedule it.
          </p>
          <p className="text-muted-foreground">
            If ChatGPT skips a number or stops early, use <em>Copy resume message</em> on the prompt
            with the conversation number it should continue from. Always read a sample before
            importing: the importer catches links, win claims and promo wording, but you are the
            final check on quality.
          </p>
        </CardContent>
      </Card>

      {form && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing ? "Edit prompt" : "New prompt"}</CardTitle>
            <CardDescription>
              Write the topic and its situations. The format, quality and safety rules are added
              automatically. A prompt must be able to reach 2,000 lines.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-title">Title</Label>
                <Input
                  id="p-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-topic">Topic of the whole set</Label>
                <Input
                  id="p-topic"
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Short description</Label>
              <Input
                id="p-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-sit">Situations (one per line, as “Label: what happens”)</Label>
              <Textarea
                id="p-sit"
                rows={8}
                value={form.situations}
                onChange={(e) => setForm({ ...form, situations: e.target.value })}
                placeholder={
                  "Ulam mamaya: Nagtatanungan kung ano ang lulutuin.\nPumalyang luto: May nagkwento ng nasunog na ulam."
                }
              />
              <p className="text-xs text-muted-foreground">
                {spec?.situations.length ?? 0} situation(s). Use at least 10 so 80 conversations
                stay varied.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-notes">Extra rules for this topic (optional)</Label>
              <Textarea
                id="p-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              {num("conversations", "Conversations")}
              {num("linesMin", "Min lines each")}
              {num("linesMax", "Max lines each")}
              {num("batchSize", "Conversations per reply")}
            </div>
            {spec && (
              <p className={`text-sm ${problem ? "text-destructive" : "text-muted-foreground"}`}>
                {problem ??
                  `${promptStats(spec).minLines.toLocaleString()} to ${promptStats(spec).maxLines.toLocaleString()} lines in ${promptStats(spec).batches} replies.`}
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={save} disabled={m.create.isPending || m.update.isPending}>
                {editing ? "Save changes" : "Add to library"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setForm(null);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {entries.map((e) => {
          const stats = promptStats(e);
          const text = buildPrompt(e, cast);
          const isOpen = open === e.id;
          return (
            <Card key={e.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BookText className="size-4" /> {e.title}
                    </CardTitle>
                    <CardDescription>{e.description}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{e.topic}</Badge>
                    <Badge variant="outline">{e.builtin ? "Built-in" : "Mine"}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {e.conversations} conversations · {e.linesMin}–{e.linesMax} lines each ·{" "}
                  <strong className="text-foreground">
                    {stats.minLines.toLocaleString()}–{stats.maxLines.toLocaleString()} lines
                  </strong>{" "}
                  · {stats.batches} replies · {e.situations.length} situations
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => copy(text, "Prompt")} disabled={!cast.length}>
                    <Copy className="mr-1.5 size-3.5" /> Copy prompt
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setOpen(isOpen ? null : e.id)}>
                    {isOpen ? (
                      <ChevronUp className="mr-1.5 size-3.5" />
                    ) : (
                      <ChevronDown className="mr-1.5 size-3.5" />
                    )}
                    {isOpen ? "Hide" : "Preview"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const n = Number(
                        window.prompt("Continue from which conversation number?", "6"),
                      );
                      if (Number.isInteger(n) && n >= 1 && n <= e.conversations)
                        copy(resumeMessage(n, e), "Resume message");
                    }}
                  >
                    Copy resume message
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => startNew(e)}>
                    <CopyPlus className="mr-1.5 size-3.5" /> Duplicate
                  </Button>
                  {!e.builtin && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => startEdit(e)}>
                        <Pencil className="mr-1.5 size-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Delete ${e.title}`}
                        onClick={async () => {
                          if (!window.confirm(`Delete “${e.title}”?`)) return;
                          await m.remove.mutateAsync(e.id);
                          toast.success("Prompt deleted");
                        }}
                      >
                        <Trash2 className="mr-1.5 size-3.5" /> Delete
                      </Button>
                    </>
                  )}
                </div>
                {isOpen && (
                  <pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                    {text}
                  </pre>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
