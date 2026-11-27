"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { statusLabel } from "../constants";
import { DateField } from "./DateField";
import { OptionCombobox, type ComboboxOption } from "./OptionCombobox";
import type { RegisterFilters } from "../providers/checksApi";

const STATUS_FILTERS = ["ALL", "PENDING", "RECEIVED", "IN_CLEARING", "CLEARED", "RETURNED", "CANCELLED"] as const;

const FLAG_FILTERS = [
  { value: "ALL", label: "Any" },
  { value: "PDC", label: "Post-dated (PDC)" },
  { value: "STALE", label: "Stale (over 180 days)" },
  { value: "NOREPL", label: "Returned/cancelled, not yet replaced" },
  { value: "REPL", label: "Part of a replacement" },
] as const;

const EMPTY: RegisterFilters = {
  direction: "ALL",
  status: "ALL",
  accountId: undefined,
  bank: undefined,
  payee: undefined,
  flag: undefined,
  from: undefined,
  to: undefined,
  q: undefined,
};

type Props = {
  accountOptions: ComboboxOption[];
  bankOptions: ComboboxOption[];
  filters: RegisterFilters;
  onChange: (next: RegisterFilters) => void;
};

/** Filter band for the check register, in the same shape as the other v2 modules. */
export function CheckFilters({ accountOptions, bankOptions, filters, onChange }: Props) {
  const [query, setQuery] = useState(filters.q ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = query.trim();
      if ((filters.q ?? "") !== next) onChange({ ...filters, q: next || undefined });
    }, 150);
    return () => clearTimeout(timer);
  }, [query, filters, onChange]);

  const dirty =
    query.trim() !== "" ||
    (filters.direction ?? "ALL") !== "ALL" ||
    (filters.status ?? "ALL") !== "ALL" ||
    (filters.flag ?? "ALL") !== "ALL" ||
    filters.accountId !== undefined ||
    filters.bank !== undefined ||
    filters.payee !== undefined ||
    filters.from !== undefined ||
    filters.to !== undefined;

  return (
    <div aria-label="Check register filters" className="border-b border-border/50 px-4 py-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4 xl:grid-cols-7">
        <Band label="Bank">
          <OptionCombobox
            options={bankOptions}
            value={filters.bank ?? "ALL"}
            onChange={(value) =>
              onChange({ ...filters, bank: value === "ALL" ? undefined : value, accountId: undefined })
            }
            placeholder="All banks"
            searchPlaceholder="Search banks"
            emptyLabel="No bank matches that search."
            aria-label="Bank filter"
          />
        </Band>

        <Band label="Account">
          <OptionCombobox
            options={accountOptions}
            value={filters.accountId ? String(filters.accountId) : "ALL"}
            onChange={(value) => onChange({ ...filters, accountId: value === "ALL" ? undefined : Number(value) })}
            placeholder="All accounts"
            searchPlaceholder="Search accounts"
            emptyLabel="No account matches that search."
            aria-label="Account filter"
          />
        </Band>

        <Band label="Direction">
          <Select value={filters.direction ?? "ALL"} onValueChange={(value) => onChange({ ...filters, direction: value })}>
            <SelectTrigger className="h-9 w-full min-w-0" aria-label="Direction filter">
              <SelectValue className="truncate" placeholder="All" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="ISSUED">Issued</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
            </SelectContent>
          </Select>
        </Band>

        <Band label="Status">
          <Select value={filters.status ?? "ALL"} onValueChange={(value) => onChange({ ...filters, status: value })}>
            <SelectTrigger className="h-9 w-full min-w-0" aria-label="Status filter">
              <SelectValue className="truncate" placeholder="All" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {STATUS_FILTERS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status === "ALL" ? "All" : statusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Band>

        <Band label="Flag">
          <Select value={filters.flag ?? "ALL"} onValueChange={(value) => onChange({ ...filters, flag: value })}>
            <SelectTrigger className="h-9 w-full min-w-0" aria-label="Flag filter">
              <SelectValue className="truncate" placeholder="Any" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {FLAG_FILTERS.map((flag) => (
                <SelectItem key={flag.value} value={flag.value}>
                  {flag.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Band>

        <Band label="Check date from">
          <DateField
            id="check-from"
            value={filters.from ?? ""}
            maxDate={filters.to}
            onChange={(value) => onChange({ ...filters, from: value || undefined })}
          />
        </Band>

        <Band label="Check date to">
          <DateField
            id="check-to"
            value={filters.to ?? ""}
            minDate={filters.from}
            onChange={(value) => onChange({ ...filters, to: value || undefined })}
          />
        </Band>
      </div>

      <div className="mt-3 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Search
          </span>
          <div className="relative min-w-0">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="check-search"
              aria-label="Search checks"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Check no., payee, customer or reason"
              className="h-9 pl-8"
            />
          </div>
        </div>
        {dirty ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 gap-1 px-2 text-xs"
            onClick={() => {
              setQuery("");
              onChange({ ...EMPTY });
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** A labelled cell in the band: the caption sits above the control, as the register reference draws it. */
function Band({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
