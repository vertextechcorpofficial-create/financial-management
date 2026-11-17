"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ALL } from "../constants";
import { EMPTY_LOG_FILTERS, type LogFilters } from "../hooks/useMasterlist";
import { DateField } from "./DateField";
import { OptionCombobox } from "./OptionCombobox";

type Props = {
  filters: LogFilters;
  modules: string[];
  users: string[];
  onChange: (next: LogFilters) => void;
};

const TIMESTAMP_OPTIONS = [
  { value: ALL, label: "Any timestamp" },
  { value: "PHT", label: "Stored in PHT" },
  { value: "NOT_PHT", label: "Not PHT (defect)" },
];

/** FSD 1.6 movement log facets: module, user, timestamp, date range, search. */
export function AuditFilters({ filters, modules, users, onChange }: Props) {
  const [query, setQuery] = useState(filters.q);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = query.trim();
      if (next !== filters.q) onChange({ ...filters, q: next });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, filters, onChange]);

  const userOptions = [
    { value: ALL, label: "All users" },
    ...users.map((user) => ({ value: user, label: user })),
  ];

  const dirty =
    filters.module !== ALL || filters.user !== ALL || filters.pht !== ALL || !!filters.from || !!filters.to || !!filters.q;

  return (
    <div
      aria-label="Movement log filters"
      className="grid items-center gap-3 border-b border-border/50 px-4 py-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
    >
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search log entries"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Action or reference"
          className="pl-9"
        />
      </div>

      <OptionCombobox
        options={[{ value: ALL, label: "All modules" }, ...modules.map((module) => ({ value: module, label: module }))]}
        value={filters.module}
        onChange={(value) => onChange({ ...filters, module: value })}
        placeholder="All modules"
        searchPlaceholder="Search modules"
        emptyLabel="No module matches."
        aria-label="Module filter"
      />

      <OptionCombobox
        options={userOptions}
        value={filters.user}
        onChange={(value) => onChange({ ...filters, user: value })}
        placeholder="All users"
        searchPlaceholder="Search users"
        emptyLabel="No user matches."
        aria-label="User filter"
      />

      <Select value={filters.pht} onValueChange={(value) => onChange({ ...filters, pht: value })}>
        <SelectTrigger className="w-full" aria-label="Timestamp filter">
          <SelectValue className="truncate" placeholder="Any timestamp" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {TIMESTAMP_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative min-w-0">
        <span className="pointer-events-none absolute -top-2 left-2 z-10 rounded bg-card px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          From
        </span>
        <DateField
          id="log-from"
          aria-label="From date"
          value={filters.from}
          maxDate={filters.to || undefined}
          onChange={(value) => onChange({ ...filters, from: value })}
        />
      </div>

      <div className="relative min-w-0">
        <span className="pointer-events-none absolute -top-2 left-2 z-10 rounded bg-card px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          To
        </span>
        <DateField
          id="log-to"
          aria-label="To date"
          value={filters.to}
          minDate={filters.from || undefined}
          onChange={(value) => onChange({ ...filters, to: value })}
        />
      </div>

      {dirty ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 justify-self-start"
          onClick={() => {
            setQuery("");
            onChange(EMPTY_LOG_FILTERS);
          }}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
