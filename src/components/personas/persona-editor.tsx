"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAccounts } from "@/features/telegram/hooks";
import { usePersonaMutations } from "@/features/personas/hooks";
import type { Persona } from "@/server/personas/personas";
import { MESSAGE_LENGTHS, personaSchema } from "@/validators/personas";

const NONE = "__none__";
const LIST_FIELDS = [
  "interests",
  "hobbies",
  "likes",
  "dislikes",
  "commonExpressions",
  "behaviorRules",
] as const;
const LEVEL_FIELDS = [
  ["tagalogLevel", "Tagalog"],
  ["englishLevel", "English"],
  ["taglishLevel", "Taglish"],
  ["emojiFrequency", "Emoji frequency"],
  ["slangLevel", "Slang"],
] as const;
const LIST_LABELS: Record<(typeof LIST_FIELDS)[number], string> = {
  interests: "Interests",
  hobbies: "Hobbies",
  likes: "Likes",
  dislikes: "Dislikes",
  commonExpressions: "Common expressions",
  behaviorRules: "Behavior rules",
};

type FormState = {
  name: string;
  telegramAccountId: string;
  personality: string;
  background: string;
  occupation: string;
  languageStyle: string;
  messageLength: (typeof MESSAGE_LENGTHS)[number];
  active: boolean;
  levels: Record<(typeof LEVEL_FIELDS)[number][0], number>;
  lists: Record<(typeof LIST_FIELDS)[number], string>;
};

const toLines = (a: string[]) => a.join("\n");
const fromLines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

function initial(p: Persona | null): FormState {
  return {
    name: p?.name ?? "",
    telegramAccountId: p?.telegramAccountId ?? NONE,
    personality: p?.personality ?? "",
    background: p?.background ?? "",
    occupation: p?.occupation ?? "",
    languageStyle: p?.languageStyle ?? "",
    messageLength: p?.messageLength ?? "SHORT",
    active: p?.active ?? true,
    levels: {
      tagalogLevel: p?.tagalogLevel ?? 60,
      englishLevel: p?.englishLevel ?? 40,
      taglishLevel: p?.taglishLevel ?? 60,
      emojiFrequency: p?.emojiFrequency ?? 30,
      slangLevel: p?.slangLevel ?? 40,
    },
    lists: Object.fromEntries(
      LIST_FIELDS.map((f) => [f, toLines((p?.[f] as string[] | undefined) ?? [])]),
    ) as FormState["lists"],
  };
}

export function PersonaEditor({
  open,
  persona,
  onClose,
}: {
  open: boolean;
  persona: Persona | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {/* Keyed so the form re-initialises for each persona. */}
        {open && <EditorForm key={persona?.id ?? "new"} persona={persona} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function EditorForm({ persona, onClose }: { persona: Persona | null; onClose: () => void }) {
  const m = usePersonaMutations();
  const { data: accounts } = useAccounts();
  const [f, setF] = useState<FormState>(() => initial(persona));
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    setError(null);
    const parsed = personaSchema.safeParse({
      name: f.name,
      telegramAccountId: f.telegramAccountId === NONE ? null : f.telegramAccountId,
      personality: f.personality,
      background: f.background,
      occupation: f.occupation,
      languageStyle: f.languageStyle,
      messageLength: f.messageLength,
      active: f.active,
      ...f.levels,
      ...Object.fromEntries(LIST_FIELDS.map((k) => [k, fromLines(f.lists[k])])),
    });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    try {
      if (persona) await m.update.mutateAsync({ id: persona.id, data: parsed.data });
      else await m.create.mutateAsync(parsed.data);
      toast.success(persona ? "Persona saved" : "Persona created");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const accountItems = [
    { value: NONE, label: "No account" },
    ...(accounts ?? []).map((a) => ({ value: a.id, label: `${a.displayName} (@${a.username})` })),
  ];

  return (
    <>
      <SheetHeader>
        <SheetTitle>{persona ? `Edit ${persona.name}` : "New persona"}</SheetTitle>
        <SheetDescription>
          These fields are sent to Claude as the persona&apos;s voice and rules.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 px-4">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Name</Label>
          <Input id="p-name" value={f.name} onChange={(e) => set("name", e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Telegram account</Label>
          <Select
            value={f.telegramAccountId}
            onValueChange={(v) => set("telegramAccountId", v ?? NONE)}
            items={accountItems}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accountItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Field label="Personality" value={f.personality} onChange={(v) => set("personality", v)} />
        <Field label="Background" value={f.background} onChange={(v) => set("background", v)} />
        <div className="space-y-1.5">
          <Label htmlFor="p-occ">Occupation</Label>
          <Input
            id="p-occ"
            value={f.occupation}
            onChange={(e) => set("occupation", e.target.value)}
          />
        </div>
        <Field
          label="Language style"
          value={f.languageStyle}
          onChange={(v) => set("languageStyle", v)}
        />

        <div className="space-y-3 rounded-md border p-3">
          {LEVEL_FIELDS.map(([key, label]) => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-sm">
                <Label htmlFor={key}>{label}</Label>
                <span className="text-muted-foreground">{f.levels[key]}</span>
              </div>
              <input
                id={key}
                type="range"
                min={0}
                max={100}
                value={f.levels[key]}
                onChange={(e) => set("levels", { ...f.levels, [key]: Number(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label>Message length</Label>
          <Select
            value={f.messageLength}
            onValueChange={(v) => v && set("messageLength", v as FormState["messageLength"])}
            items={MESSAGE_LENGTHS.map((l) => ({ value: l, label: l.toLowerCase() }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESSAGE_LENGTHS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {LIST_FIELDS.map((k) => (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={`l-${k}`}>
              {LIST_LABELS[k]} <span className="text-xs text-muted-foreground">(one per line)</span>
            </Label>
            <Textarea
              id={`l-${k}`}
              rows={3}
              value={f.lists[k]}
              onChange={(e) => set("lists", { ...f.lists, [k]: e.target.value })}
            />
          </div>
        ))}

        <div className="flex items-center justify-between">
          <Label htmlFor="p-active">Active</Label>
          <Switch id="p-active" checked={f.active} onCheckedChange={(v) => set("active", v)} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <SheetFooter className="flex-row justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={m.create.isPending || m.update.isPending}>
          Save
        </Button>
      </SheetFooter>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `f-${label}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
