"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { usePersonaMutations, usePersonas } from "@/features/personas/hooks";
import { useAccounts } from "@/features/telegram/hooks";
import type { Persona } from "@/server/personas/personas";
import { PersonaEditor } from "./persona-editor";

export function PersonasManager() {
  const { data, isLoading, error } = usePersonas();
  const { data: accounts } = useAccounts();
  const m = usePersonaMutations();
  const [editing, setEditing] = useState<Persona | null>(null);
  const [open, setOpen] = useState(false);

  const openEditor = (p: Persona | null) => {
    setEditing(p);
    setOpen(true);
  };

  const accountLabel = (id: string | null) => {
    const a = accounts?.find((x) => x.id === id);
    return a ? `@${a.username}` : "no account";
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
        <h1 className="text-2xl font-semibold">Personas</h1>
        <Button onClick={() => openEditor(null)}>
          <Plus className="mr-1.5 size-4" /> New persona
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((p) => (
          <Card key={p.id} className={p.active ? undefined : "opacity-60"}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                {p.name}
                <Badge variant="outline">{accountLabel(p.telegramAccountId)}</Badge>
              </CardTitle>
              <CardDescription className="line-clamp-2">
                {p.personality || "No personality set"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary">Taglish {p.taglishLevel}</Badge>
                <Badge variant="secondary">Emoji {p.emojiFrequency}</Badge>
                <Badge variant="secondary">{p.messageLength.toLowerCase()} msgs</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Switch
                    checked={p.active}
                    onCheckedChange={(v) =>
                      run(m.update.mutateAsync({ id: p.id, data: { active: v } }))
                    }
                    aria-label={`Toggle ${p.name} active`}
                  />
                  Active
                </span>
                <span className="space-x-1">
                  <Button size="sm" variant="outline" onClick={() => openEditor(p)}>
                    <Pencil className="mr-1 size-3.5" /> Edit
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${p.name}`}
                    onClick={() =>
                      confirm(
                        `Delete ${p.name}? Their memories and relationships are deleted too.`,
                      ) && run(m.remove.mutateAsync(p.id))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PersonaEditor open={open} persona={editing} onClose={() => setOpen(false)} />
    </div>
  );
}
