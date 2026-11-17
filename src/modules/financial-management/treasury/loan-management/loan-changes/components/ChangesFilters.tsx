"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { CHANGE_KINDS, CHANGE_KIND_LABEL } from "../constants";
import type { ChangeFilters } from "../hooks/useChanges";
import type { LoanOption } from "../types";
import { DateField } from "./DateField";
import { OptionCombobox } from "./OptionCombobox";

interface Props {
  filters: ChangeFilters;
  loans: LoanOption[];
  onChange: (patch: Partial<ChangeFilters>) => void;
  onClear: () => void;
}

export function ChangesFilters({ filters, loans, onChange, onClear }: Props) {
  const isFiltered =
    filters.q.trim().length > 0 || filters.kind !== "ALL" || filters.loanId !== null || filters.from !== null || filters.to !== null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <div className="relative w-full min-w-0 sm:w-[280px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={filters.q}
          onChange={(event) => onChange({ q: event.target.value })}
          placeholder="Change no, loan or note"
          aria-label="Search changes"
          className="h-9 pl-8"
        />
      </div>

      <Select value={filters.kind} onValueChange={(value) => onChange({ kind: value as ChangeFilters["kind"] })}>
        <SelectTrigger className="h-9 w-full sm:w-[185px]" aria-label="Filter by kind">
          <SelectValue className="truncate" placeholder="Every kind" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          <SelectItem value="ALL">Every kind</SelectItem>
          {CHANGE_KINDS.map((kind) => (
            <SelectItem key={kind} value={kind}>
              {CHANGE_KIND_LABEL[kind]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="w-full min-w-0 sm:w-[230px]">
        <OptionCombobox
          value={filters.loanId ? String(filters.loanId) : ""}
          onChange={(value) => onChange({ loanId: value ? Number(value) : null })}
          placeholder="Every loan"
          searchPlaceholder="Search loan no or lender"
          emptyLabel="No open loan found."
          className="h-9"
          options={loans.map((loan) => ({
            value: String(loan.id),
            label: `${loan.loanNo} · ${loan.lenderName}`,
            searchText: `${loan.loanNo} ${loan.lenderName}`,
            description: `${loan.status} · ${loan.installmentAmount.toFixed(2)} per installment`,
          }))}
        />
      </div>

      <div className="w-[150px]">
        <DateField
          id="changes-from"
          value={filters.from ?? ""}
          onChange={(value) => onChange({ from: value || null })}
          placeholder="From"
          aria-label="Effective from"
        />
      </div>
      <div className="w-[150px]">
        <DateField
          id="changes-to"
          value={filters.to ?? ""}
          onChange={(value) => onChange({ to: value || null })}
          placeholder="To"
          aria-label="Effective to"
        />
      </div>

      {isFiltered ? (
        <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 px-2 text-xs" onClick={onClear}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
