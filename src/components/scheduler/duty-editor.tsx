"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SHIFT_PRESETS, type ShiftRule, type ShiftType } from "@/lib/scheduling/duty";
import { hhmmToMinutes, minutesToHHMM } from "@/lib/scheduling/time";

const DAYS = [
  ["1", "Monday"],
  ["2", "Tuesday"],
  ["3", "Wednesday"],
  ["4", "Thursday"],
  ["5", "Friday"],
  ["6", "Saturday"],
  ["0", "Sunday"],
] as const;

const TYPES: { value: ShiftType; label: string }[] = [
  { value: "OFF", label: "Day off" },
  { value: "DAY", label: "Day shift 09:00–21:00" },
  { value: "NIGHT", label: "Night shift 21:00–09:00" },
  { value: "CUSTOM", label: "Custom hours" },
];

export type DutyRules = Record<string, ShiftRule | undefined>;

/** Clean rule for saving: presets carry no times, customs keep theirs. */
export function normalizeRule(r: ShiftRule): ShiftRule {
  return r.type === "CUSTOM"
    ? { type: "CUSTOM", startMinute: r.startMinute ?? 540, endMinute: r.endMinute ?? 1020 }
    : { type: r.type };
}

function RuleEditor({
  rule,
  onChange,
  label,
}: {
  rule: ShiftRule;
  onChange: (r: ShiftRule) => void;
  label: string;
}) {
  const start = rule.startMinute ?? 540;
  const end = rule.endMinute ?? 1020;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={rule.type}
        onValueChange={(v) => v && onChange({ ...rule, type: v as ShiftType })}
        items={TYPES}
      >
        <SelectTrigger className="w-56" aria-label={`${label} shift`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {rule.type === "CUSTOM" && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Input
            type="time"
            className="w-28"
            aria-label={`${label} start`}
            value={minutesToHHMM(start)}
            onChange={(e) => {
              const m = hhmmToMinutes(e.target.value);
              if (m !== null) onChange({ ...rule, startMinute: m, endMinute: end });
            }}
          />
          <span>to</span>
          <Input
            type="time"
            className="w-28"
            aria-label={`${label} end`}
            value={minutesToHHMM(end)}
            onChange={(e) => {
              const m = hhmmToMinutes(e.target.value);
              if (m !== null) onChange({ ...rule, startMinute: start, endMinute: m });
            }}
          />
          {end <= start && <span className="text-xs">(ends next day)</span>}
        </div>
      )}
      {(rule.type === "DAY" || rule.type === "NIGHT") && (
        <span className="text-xs text-muted-foreground">
          {minutesToHHMM(SHIFT_PRESETS[rule.type].startMinute)}–
          {minutesToHHMM(SHIFT_PRESETS[rule.type].endMinute)}
          {rule.type === "NIGHT" && " (next day)"}
        </span>
      )}
    </div>
  );
}

/** Weekly pattern + date-specific overrides (day offs, swapped or custom shifts). */
export function DutyEditor({
  weekly,
  overrides,
  onWeekly,
  onOverrides,
}: {
  weekly: DutyRules;
  overrides: DutyRules;
  onWeekly: (w: DutyRules) => void;
  onOverrides: (o: DutyRules) => void;
}) {
  const [newDate, setNewDate] = useState("");
  const get = (d: string): ShiftRule => weekly[d] ?? { type: "OFF" };
  const dates = Object.keys(overrides).sort();

  const addOverride = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return toast.error("Pick a date first");
    if (overrides[newDate]) return toast.error("That date already has an override");
    onOverrides({ ...overrides, [newDate]: { type: "OFF" } });
    setNewDate("");
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">Weekly pattern</p>
        {DAYS.map(([key, name]) => (
          <div key={key} className="flex flex-wrap items-center gap-3">
            <span className="w-24 text-sm">{name}</span>
            <RuleEditor
              label={name}
              rule={get(key)}
              onChange={(r) => onWeekly({ ...weekly, [key]: r })}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Specific dates</p>
        <p className="text-xs text-muted-foreground">
          Overrides the weekly pattern for one date: a day off, a swapped shift, or custom hours.
        </p>
        {dates.map((d) => (
          <div key={d} className="flex flex-wrap items-center gap-3">
            <span className="w-24 text-sm">{d}</span>
            <RuleEditor
              label={d}
              rule={overrides[d]!}
              onChange={(r) => onOverrides({ ...overrides, [d]: r })}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${d}`}
              onClick={() => {
                const next = { ...overrides };
                delete next[d];
                onOverrides(next);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-40"
            aria-label="New override date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={addOverride}>
            <Plus className="mr-1 size-3.5" /> Add date
          </Button>
        </div>
      </div>
    </div>
  );
}
