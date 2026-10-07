"use client";

import { AlertTriangle, CheckCircle2, Copy, Download, FileUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useImportCommit, useImportPreview, type ImportPreview } from "@/features/imports/hooks";
import { usePersonas } from "@/features/personas/hooks";
import { useGroups } from "@/features/telegram/hooks";

const SKIP = "__skip__";
const CODE_LABEL: Record<string, string> = {
  win_claim: "claims winning money",
  promo_language: "promotional wording",
  link: "contains a link",
  unverified_number: "figure not in confirmed facts",
  allyono_mentions: "mentions AllYono too often",
  repetition: "near-duplicate line",
  same_speaker_run: "same person 3+ times in a row",
  too_long: "over 600 characters",
};

export function ImportWizard() {
  const { data: groups } = useGroups();
  const { data: personas } = usePersonas();
  const preview = useImportPreview();
  const commit = useImportCommit();

  const privateGroups = (groups ?? []).filter((g) => g.type === "PRIVATE_SIMULATION" && g.active);
  const [groupChoice, setGroupChoice] = useState("");
  const group = privateGroups.find((g) => g.id === groupChoice) ?? privateGroups[0];

  const [file, setFile] = useState<File | null>(null);
  const [minSize, setMinSize] = useState(15);
  const [maxSize, setMaxSize] = useState(35);
  const [result, setResult] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dropFlagged, setDropFlagged] = useState(true);
  const [done, setDone] = useState<{ conversations: number; lines: number } | null>(null);

  const members = (personas ?? []).filter((p) => group?.participantIds.includes(p.id) && p.active);

  const analyze = async () => {
    if (!file || !group) return;
    setDone(null);
    try {
      const r = await preview.mutateAsync({ file, groupId: group.id, minSize, maxSize });
      setResult(r);
      setMapping(Object.fromEntries(r.speakers.map((s) => [s.name, s.personaId ?? SKIP])));
    } catch (e) {
      setResult(null);
      toast.error(e instanceof Error ? e.message : "Could not read the file");
    }
  };

  // What will actually be imported, given the mapping and the "leave out flagged lines" choice.
  const payload = (() => {
    if (!result || !group) return null;
    const severe = new Set(result.issues.severe);
    const conversations = result.conversations
      .map((c) => ({
        title: c.title,
        messages: c.lines
          .filter((l) => mapping[l.speaker] && mapping[l.speaker] !== SKIP)
          .filter((l) => !(dropFlagged && l.flags?.some((f) => severe.has(f))))
          .map((l) => ({ personaId: mapping[l.speaker], text: l.text })),
      }))
      .filter(
        (c) => c.messages.length >= 2 && new Set(c.messages.map((m) => m.personaId)).size >= 2,
      );
    return {
      groupId: group.id,
      conversations,
      lines: conversations.reduce((n, c) => n + c.messages.length, 0),
    };
  })();

  const doImport = async () => {
    if (!payload || !payload.conversations.length) return;
    try {
      const r = await commit.mutateAsync({
        groupId: payload.groupId,
        conversations: payload.conversations,
      });
      setDone(r);
      setResult(null);
      setFile(null);
      toast.success(`Imported ${r.conversations} conversation(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  };

  const prompt = (() => {
    const who = (personas ?? [])
      .filter((p) => p.active)
      .map((p) => `- ${p.name}${p.personality ? `: ${p.personality}` : ""}`)
      .join("\n");
    return `Write 50 separate casual group-chat conversations in natural Filipino (Tagalog / Taglish) between these friends:
${who || "- (add personas first)"}

Output ONE table with exactly these columns: conversation, topic, speaker, message
- "conversation": a number; all rows of one conversation share it.
- "speaker": exactly one of the names above.
- Each conversation has 12 to 30 messages. Not everyone speaks in every conversation.
- Everyday topics only: food, work, family, weather, hobbies, shopping, movies, music, weekends.
- Vary message length, slang and emoji; keep each persona's personality consistent.
Rules: no links or phone numbers; no talk about winning money, betting tips or "lucky" games; no promotions, no urging anyone to register, deposit or play; no fake testimonials.`;
  })();

  const flaggedCount = result
    ? Object.entries(result.issues.byCode)
        .filter(([c]) => result.issues.severe.includes(c))
        .reduce((n, [, v]) => n + v, 0)
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Import conversations</h1>
      <p className="text-sm text-muted-foreground">
        Upload conversations written elsewhere (Excel, CSV or PDF). They become{" "}
        <strong>draft</strong> conversations in a private simulation group. Nothing is sent. The
        scheduler uses these drafts first, one time each, and they need no AI quota.
      </p>

      {done && (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>
            Imported {done.conversations} conversation(s) · {done.lines.toLocaleString()} lines
          </AlertTitle>
          <AlertDescription>
            They are saved as drafts. See them under{" "}
            <Link href="/history/conversations" className="underline">
              History → Conversations
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose the file</CardTitle>
          <CardDescription>
            .xlsx, .csv or .pdf, up to 4 MB and 20,000 lines per upload. Macros are never run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Private simulation group</Label>
              <Select
                value={group?.id ?? ""}
                onValueChange={(v) => v && setGroupChoice(v)}
                items={privateGroups.map((g) => ({ value: g.id, label: g.name }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {privateGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min">Min lines per conversation</Label>
              <Input
                id="min"
                type="number"
                min={4}
                max={200}
                value={minSize}
                onChange={(e) => setMinSize(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max">Max lines per conversation</Label>
              <Input
                id="max"
                type="number"
                min={4}
                max={200}
                value={maxSize}
                onChange={(e) => setMaxSize(Number(e.target.value))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The size range is only used when the file has no conversation column or headings; then
            it is cut into conversations of about this size.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="file"
              accept=".xlsx,.csv,.pdf"
              aria-label="Conversation file"
              className="max-w-sm"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
                setDone(null);
              }}
            />
            <Button onClick={analyze} disabled={!file || !group || preview.isPending}>
              <FileUp className="mr-1.5 size-4" /> {preview.isPending ? "Reading…" : "Analyze file"}
            </Button>
            <Button variant="outline" render={<a href="/api/imports/template" download />}>
              <Download className="mr-1.5 size-4" /> Excel template
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && payload && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Check who is speaking</CardTitle>
              <CardDescription>
                {result.totalLines.toLocaleString()} lines · {result.conversationCount}{" "}
                conversation(s) · read as {result.kind.toUpperCase()}. Match each name in the file
                to a persona, or skip those lines.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name in the file</TableHead>
                    <TableHead>Lines</TableHead>
                    <TableHead>Persona</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.speakers.map((s) => {
                    const items = [
                      { value: SKIP, label: "Skip these lines" },
                      ...members.map((m) => ({ value: m.id, label: m.name })),
                    ];
                    return (
                      <TableRow key={s.name}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.count.toLocaleString()}</TableCell>
                        <TableCell>
                          <Select
                            value={mapping[s.name] ?? SKIP}
                            onValueChange={(v) => v && setMapping((m) => ({ ...m, [s.name]: v }))}
                            items={items}
                          >
                            <SelectTrigger className="w-56" aria-label={`Persona for ${s.name}`}>
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Content check</CardTitle>
              <CardDescription>
                The same rules as AI-written conversations are applied to the uploaded text.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.keys(result.issues.byCode).length === 0 ? (
                <p className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-green-600" /> No problems found.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(result.issues.byCode).map(([code, n]) => (
                      <Badge
                        key={code}
                        variant={result.issues.severe.includes(code) ? "destructive" : "outline"}
                      >
                        {CODE_LABEL[code] ?? code}: {n}
                      </Badge>
                    ))}
                  </div>
                  {flaggedCount > 0 && (
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={dropFlagged}
                        onCheckedChange={(c) => setDropFlagged(Boolean(c))}
                        className="mt-0.5"
                      />
                      <span>
                        Leave out the lines flagged as winning claims, promotions, links or
                        unverified figures (recommended).
                      </span>
                    </label>
                  )}
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {result.issues.examples.slice(0, 6).map((x, i) => (
                      <li key={i}>
                        <AlertTriangle className="mr-1 inline size-3" /> conversation{" "}
                        {x.conversation}, line {x.line} ({CODE_LABEL[x.code] ?? x.code}): &ldquo;
                        {x.text}&rdquo;
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Preview and import</CardTitle>
              <CardDescription>
                {payload.conversations.length} conversation(s) · {payload.lines.toLocaleString()}{" "}
                lines will be imported.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {payload.conversations[0] && (
                <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">
                    First conversation
                    {payload.conversations[0].title ? `: ${payload.conversations[0].title}` : ""}
                  </p>
                  {payload.conversations[0].messages.slice(0, 8).map((m, i) => (
                    <p key={i}>
                      <span className="font-semibold">
                        {personas?.find((p) => p.id === m.personaId)?.name}:
                      </span>{" "}
                      {m.text}
                    </p>
                  ))}
                </div>
              )}
              <Button
                onClick={doImport}
                disabled={commit.isPending || !payload.conversations.length}
              >
                {commit.isPending
                  ? "Importing…"
                  : `Import ${payload.conversations.length} conversation(s) as drafts`}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prompt for the other AI</CardTitle>
          <CardDescription>
            Paste this into the AI site you use. It already contains your personas and the format
            this page reads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
            {prompt}
          </pre>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(prompt);
              toast.success("Prompt copied");
            }}
          >
            <Copy className="mr-1.5 size-3.5" /> Copy prompt
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
