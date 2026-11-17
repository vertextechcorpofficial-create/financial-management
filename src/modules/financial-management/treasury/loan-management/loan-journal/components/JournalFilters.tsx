"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ENTRY_TYPES, ENTRY_TYPE_LABEL } from "../constants";
import { filtersAreActive, type JournalFilters } from "../hooks/useJournal";
import type { JournalOptions } from "../types";
import { DateField } from "./DateField";
import { OptionCombobox } from "./OptionCombobox";

interface Props {
  filters: JournalFilters;
  options: JournalOptions | null;
  onChange: (patch: Partial<JournalFilters>) => void;
  onClear: () => void;
}

/**
 * One filter band for both views: the same entries feed the ledger and the per-account roll-up,
 * so a filter set here must narrow both.
 */
export function JournalFilters({ filters, options, onChange, onClear }: Props) {
  const loans = options?.loans ?? [];
  const accounts = options?.accounts ?? [];
  const active = filtersAreActive(filters);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <div className="relative w-full min-w-0 sm:w-[280px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={filters.q}
          onChange={(event) => onChange({ q: event.target.value })}
          placeholder="Entry no, description or line memo"
          aria-label="Search journal entries"
          className="h-9 pl-8"
        />
      </div>

      <div className="w-full min-w-0 sm:w-[220px]">
        <OptionCombobox
          options={loans.map((loan) => ({ value: String(loan.id), label: loan.label, searchText: loan.searchText }))}
          value={filters.loanId ? String(filters.loanId) : ""}
          onChange={(value) => onChange({ loanId: value ? Number(value) : null })}
          placeholder="Every loan"
          searchPlaceholder="Search loan no or lender"
          emptyLabel="No loan matches."
          className="h-9"
        />
      </div>

      <Select
        value={filters.entryType}
        onValueChange={(value) => onChange({ entryType: value as JournalFilters["entryType"] })}
      >
        <SelectTrigger className="h-9 w-full sm:w-[190px]" aria-label="Filter by entry type">
          <SelectValue className="truncate" placeholder="Every entry type" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          <SelectItem value="ALL">Every entry type</SelectItem>
          {ENTRY_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {ENTRY_TYPE_LABEL[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="w-full min-w-0 sm:w-[195px]">
        <OptionCombobox
          options={accounts.map((account) => ({
            value: String(account.id),
            label: account.label,
            searchText: account.searchText,
          }))}
          value={filters.coaId ? String(filters.coaId) : ""}
          onChange={(value) => onChange({ coaId: value ? Number(value) : null })}
          placeholder="Every account"
          searchPlaceholder="Search GL code or title"
          emptyLabel="No account matches."
          className="h-9"
        />
      </div>

      <div className="w-[150px]">
        <DateField
          id="journal-from"
          value={filters.from}
          onChange={(value) => onChange({ from: value })}
          placeholder="From date"
          aria-label="Entries from"
        />
      </div>
      <div className="w-[150px]">
        <DateField
          id="journal-to"
          value={filters.to}
          onChange={(value) => onChange({ to: value })}
          placeholder="To date"
          aria-label="Entries to"
        />
      </div>

      {active ? (
        <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 px-2 text-xs" onClick={() => onClear()}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
