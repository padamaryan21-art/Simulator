"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const ANY = "__any__";

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-56 flex-1">
      <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
      <Input
        className="pl-8"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  width = "w-40",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  width?: string;
}) {
  const items = [{ value: ANY, label: label }, ...options];
  return (
    <Select
      value={value || ANY}
      onValueChange={(v) => onChange(!v || v === ANY ? "" : v)}
      items={items}
    >
      <SelectTrigger className={width} aria-label={label}>
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
  );
}

export function DateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Input
        type="date"
        className="w-36"
        aria-label="From date"
        value={from}
        onChange={(e) => onChange(e.target.value, to)}
      />
      <span>to</span>
      <Input
        type="date"
        className="w-36"
        aria-label="To date"
        value={to}
        onChange={(e) => onChange(from, e.target.value)}
      />
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span>
          Page {page} / {pages}
        </span>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Small hook for filter state that resets to page 1 whenever a filter changes. */
export function useFilters<T extends Record<string, string>>(initial: T) {
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(1);
  const set = <K extends keyof T>(key: K, value: T[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const setMany = (patch: Partial<T>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  return { filters, set, setMany, page, setPage };
}
