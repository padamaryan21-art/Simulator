"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSaveSending, useSettings, type SettingsData } from "@/features/conversations/hooks";
import { sendingSettingsSchema } from "@/validators/settings";

export function SettingsForm() {
  const { data } = useSettings();
  // Keyed so the form initialises once from the loaded values.
  return <SettingsFormInner key={data ? "loaded" : "loading"} data={data} />;
}

function SettingsFormInner({ data }: { data: SettingsData | undefined }) {
  const save = useSaveSending();
  const [min, setMin] = useState(data?.sending.minDelaySec ?? 5);
  const [max, setMax] = useState(data?.sending.maxDelaySec ?? 45);

  const submit = async () => {
    const parsed = sendingSettingsSchema.safeParse({ minDelaySec: min, maxDelaySec: max });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    try {
      await save.mutateAsync(parsed.data);
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message delay</CardTitle>
          <CardDescription>
            Seconds to wait between messages when sending a conversation. Longer messages wait a
            little more. Set both to 0 to send back to back.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="min">Minimum (s)</Label>
              <Input
                id="min"
                type="number"
                min={0}
                value={min}
                onChange={(e) => setMin(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max">Maximum (s)</Label>
              <Input
                id="max"
                type="number"
                min={0}
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
              />
            </div>
          </div>
          <Button onClick={submit} disabled={save.isPending}>
            Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI model pool</CardTitle>
          <CardDescription>
            Tried in this order ({data?.llm.strategy ?? "failover"}). Change it with LLM_MODELS in
            .env.local. Paid models are only used after every free one fails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data?.llm.pool.map((e, i) => (
            <div
              key={`${e.provider}:${e.model}`}
              className="flex items-center justify-between text-sm"
            >
              <span>
                {i + 1}. <span className="font-medium">{e.provider}</span> · {e.model}
              </span>
              <Badge variant={e.free ? "secondary" : "destructive"}>
                {e.free ? "free" : "paid"}
              </Badge>
            </div>
          ))}
          {data && !data.llm.pool.length && (
            <p className="text-sm text-destructive">
              No model configured. Add an API key to .env.local.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
