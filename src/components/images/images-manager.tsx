"use client";

import { ImageIcon, RotateCcw, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useTopics } from "@/features/conversations/hooks";
import {
  imageFileUrl,
  useImageMutations,
  useImageSettings,
  useImages,
  type ImageStatus,
  type LibraryImage,
  type UploadResult,
} from "@/features/images/hooks";
import { usePersonas } from "@/features/personas/hooks";
import { IMAGE_KINDS, type ImageKind } from "@/lib/image-kinds";

const NONE = "__none__";
const ANY = "__any__";

const STATUS: Record<
  ImageStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  AVAILABLE: { label: "Available", variant: "default" },
  RESERVED: { label: "In a draft", variant: "outline" },
  USED: { label: "Used", variant: "secondary" },
  DISABLED: { label: "Disabled", variant: "destructive" },
};

const KIND_LABEL: Record<ImageKind, string> = {
  PHOTO: "Photo",
  MEME: "Meme",
  GAME_LOBBY: "Game lobby screenshot",
  OTHER: "Other",
};

type Opt = { value: string; label: string };

function Pick({
  value,
  onChange,
  options,
  label,
  width = "w-full",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
  label: string;
  width?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v && onChange(v)}
      items={options}
      disabled={disabled}
    >
      <SelectTrigger className={width} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ImagesManager() {
  const { data: topicData } = useTopics();
  const { data: personas } = usePersonas();
  const m = useImageMutations();

  const topics = topicData?.topics ?? [];
  const topicOpts = (none: string): Opt[] => [
    { value: NONE, label: none },
    ...topics.map((t) => ({ value: t.id, label: t.title })),
  ];
  const personaOpts = (none: string): Opt[] => [
    { value: NONE, label: none },
    ...(personas ?? []).map((p) => ({ value: p.id, label: p.name })),
  ];

  const [fTopic, setFTopic] = useState(ANY);
  const [fPersona, setFPersona] = useState(ANY);
  const [fStatus, setFStatus] = useState(ANY);
  const { data: all } = useImages();
  const { data: shown, isLoading } = useImages({
    topicId: fTopic === ANY ? undefined : fTopic,
    personaId: fPersona === ANY ? undefined : fPersona,
    status: fStatus === ANY ? undefined : fStatus,
  });
  const counts = (all ?? []).reduce<Record<string, number>>(
    (a, i) => ((a[i.status] = (a[i.status] ?? 0) + 1), a),
    {},
  );

  const [files, setFiles] = useState<File[]>([]);
  const [uTopic, setUTopic] = useState(NONE);
  const [uPersona, setUPersona] = useState(NONE);
  const [uKind, setUKind] = useState<ImageKind>("PHOTO");
  const [uCaption, setUCaption] = useState("");
  const [results, setResults] = useState<UploadResult[]>([]);
  const [fileKey, setFileKey] = useState(0);

  const upload = async () => {
    try {
      const res = await m.upload.mutateAsync({
        files,
        topicId: uTopic === NONE ? "" : uTopic,
        personaId: uPersona === NONE ? "" : uPersona,
        kind: uKind,
        caption: uCaption,
      });
      setResults(res);
      const ok = res.filter((r) => r.ok).length;
      if (ok) toast.success(`Uploaded ${ok} picture(s)`);
      if (ok < res.length)
        toast.error(`${res.length - ok} picture(s) were not added. See the list below.`);
      setFiles([]);
      setFileKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const run = async (p: Promise<unknown>, ok?: string) => {
    try {
      await p;
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Images</h1>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS) as ImageStatus[]).map((s) => (
            <Badge key={s} variant={STATUS[s].variant}>
              {STATUS[s].label}: {counts[s] ?? 0}
            </Badge>
          ))}
        </div>
      </div>

      <Alert>
        <ImageIcon className="size-4" />
        <AlertTitle>How pictures are used</AlertTitle>
        <AlertDescription>
          A picture is attached only to a conversation about <strong>its own topic</strong>, and is
          sent by the persona you assign. Each picture is used <strong>once</strong>: after it has
          been posted it can never be picked again. Use everyday photos, memes or plain game-lobby
          screenshots. Do not upload payout or winning screenshots, and do not caption pictures with
          winning claims (such captions are refused). In the real community every picture needs your
          approval first.
        </AlertDescription>
      </Alert>

      <SettingsCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload pictures</CardTitle>
          <CardDescription>
            JPG or PNG, up to 4 MB in total per upload. Hidden data such as GPS location is removed
            automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Topic</Label>
              <Pick
                value={uTopic}
                onChange={setUTopic}
                options={topicOpts("No topic yet")}
                label="Topic for new pictures"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sent by</Label>
              <Pick
                value={uPersona}
                onChange={setUPersona}
                options={personaOpts("No persona yet")}
                label="Persona for new pictures"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Pick
                value={uKind}
                onChange={(v) => setUKind(v as ImageKind)}
                options={IMAGE_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                label="Kind of picture"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-caption">Caption (optional)</Label>
              <Input
                id="u-caption"
                value={uCaption}
                maxLength={200}
                onChange={(e) => setUCaption(e.target.value)}
                placeholder="ayan oh"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              key={fileKey}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              aria-label="Pictures to upload"
              className="max-w-sm"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <Button onClick={upload} disabled={!files.length || m.upload.isPending}>
              <Upload className="mr-1.5 size-4" />{" "}
              {m.upload.isPending
                ? "Uploading…"
                : `Upload ${files.length || ""} picture(s)`.replace("  ", " ")}
            </Button>
          </div>
          {results.length > 0 && (
            <ul className="space-y-1 text-sm">
              {results.map((r, i) => (
                <li key={i} className={r.ok ? "text-muted-foreground" : "text-destructive"}>
                  {r.ok ? "✓" : "✗"} {r.filename}
                  {r.error ? `: ${r.error}` : ""}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Pick
          value={fTopic}
          onChange={setFTopic}
          options={[
            { value: ANY, label: "All topics" },
            ...topics.map((t) => ({ value: t.id, label: t.title })),
          ]}
          label="Filter by topic"
          width="w-56"
        />
        <Pick
          value={fPersona}
          onChange={setFPersona}
          options={[
            { value: ANY, label: "All personas" },
            ...(personas ?? []).map((p) => ({ value: p.id, label: p.name })),
          ]}
          label="Filter by persona"
          width="w-44"
        />
        <Pick
          value={fStatus}
          onChange={setFStatus}
          options={[
            { value: ANY, label: "Any status" },
            ...(Object.keys(STATUS) as ImageStatus[]).map((s) => ({
              value: s,
              label: STATUS[s].label,
            })),
          ]}
          label="Filter by status"
          width="w-40"
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !shown?.length && (
        <p className="text-sm text-muted-foreground">No pictures match.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown?.map((img) => (
          <ImageCard
            key={img.id}
            img={img}
            topicOpts={topicOpts("No topic")}
            personaOpts={personaOpts("No persona")}
            onUpdate={(patch, ok) => run(m.update.mutateAsync({ id: img.id, patch }), ok)}
            onDelete={() =>
              confirm(`Delete "${img.filename}"? The file is removed too.`) &&
              run(m.remove.mutateAsync(img.id), "Deleted")
            }
            onRelease={() =>
              confirm(
                "Make this picture available again? Any draft that holds it will be cancelled.",
              ) && run(m.release.mutateAsync(img.id), "Released")
            }
          />
        ))}
      </div>
    </div>
  );
}

function SettingsCard() {
  const { data } = useImageSettings();
  const m = useImageMutations();
  return (
    <SettingsForm
      key={data ? "loaded" : "loading"}
      initial={data}
      saving={m.saveSettings.isPending}
      onSave={(s) =>
        m.saveSettings.mutateAsync(s).then(
          () => toast.success("Saved"),
          (e: Error) => toast.error(e.message),
        )
      }
    />
  );
}

function SettingsForm({
  initial,
  saving,
  onSave,
}: {
  initial: { enabled: boolean; chancePercent: number } | undefined;
  saving: boolean;
  onSave: (s: { enabled: boolean; chancePercent: number }) => void;
}) {
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [chance, setChance] = useState(initial?.chancePercent ?? 60);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Using pictures in conversations</CardTitle>
        <CardDescription>
          When a generated conversation&apos;s topic has an unused picture whose sender takes part,
          it is added as a photo message after the opening lines. At most one picture per
          conversation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Use pictures in conversations"
          />
          Use pictures
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="chance">Chance per conversation (%)</Label>
          <Input
            id="chance"
            type="number"
            min={0}
            max={100}
            className="w-28"
            value={chance}
            onChange={(e) => setChance(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          />
        </div>
        <Button
          size="sm"
          disabled={saving}
          onClick={() => onSave({ enabled, chancePercent: chance })}
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function ImageCard({
  img,
  topicOpts,
  personaOpts,
  onUpdate,
  onDelete,
  onRelease,
}: {
  img: LibraryImage;
  topicOpts: Opt[];
  personaOpts: Opt[];
  onUpdate: (
    patch: {
      caption?: string;
      kind?: ImageKind;
      topicId?: string | null;
      personaId?: string | null;
      enabled?: boolean;
    },
    ok?: string,
  ) => void;
  onDelete: () => void;
  onRelease: () => void;
}) {
  const [caption, setCaption] = useState(img.caption);
  const st = STATUS[img.status];
  // Topic and sender are fixed once a draft or a post depends on them.
  const locked = img.status === "RESERVED" || img.status === "USED";
  return (
    <Card className={img.status === "USED" ? "opacity-70" : undefined}>
      <CardContent className="space-y-3 p-4">
        <div className="relative overflow-hidden rounded-md bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, signed-in-only route; not an optimisable static asset */}
          <img
            src={imageFileUrl(img.id)}
            alt={img.caption || img.filename}
            loading="lazy"
            className="aspect-video w-full object-cover"
          />
          <Badge variant={st.variant} className="absolute top-2 left-2">
            {st.label}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground" title={img.filename}>
          {img.filename} · {img.width}×{img.height} · {Math.round(img.bytes / 1024)} KB
          {img.usedAt && ` · posted ${new Date(img.usedAt).toLocaleDateString()}`}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor={`cap-${img.id}`} className="text-xs">
            Caption
          </Label>
          <Input
            id={`cap-${img.id}`}
            value={caption}
            maxLength={200}
            placeholder="(none)"
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => caption.trim() !== img.caption && onUpdate({ caption }, "Caption saved")}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Pick
            value={img.topicId ?? NONE}
            onChange={(v) => onUpdate({ topicId: v === NONE ? null : v })}
            options={topicOpts}
            label={`Topic for ${img.filename}`}
            disabled={locked}
          />
          <Pick
            value={img.personaId ?? NONE}
            onChange={(v) => onUpdate({ personaId: v === NONE ? null : v })}
            options={personaOpts}
            label={`Sender for ${img.filename}`}
            disabled={locked}
          />
        </div>
        <Pick
          value={img.kind}
          onChange={(v) => onUpdate({ kind: v as ImageKind })}
          options={IMAGE_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          label={`Kind of ${img.filename}`}
        />
        {(!img.topicId || !img.personaId) && img.status === "AVAILABLE" && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Set both a topic and a sender, or conversations can never pick this picture.
          </p>
        )}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={img.enabled}
              onCheckedChange={(v) => onUpdate({ enabled: v })}
              aria-label={`Enable ${img.filename}`}
            />
            Enabled
          </label>
          <span className="flex gap-1">
            {img.status !== "USED" && img.status !== "AVAILABLE" && img.status !== "DISABLED" && (
              <Button size="sm" variant="outline" onClick={onRelease}>
                <RotateCcw className="mr-1 size-3.5" /> Release
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete ${img.filename}`}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
