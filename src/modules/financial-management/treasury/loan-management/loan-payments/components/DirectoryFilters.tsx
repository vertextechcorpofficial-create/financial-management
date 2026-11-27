"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { LENDER_TYPES, LENDER_TYPE_LABEL, LOAN_STATUSES, LOAN_STATUS_LABEL, REPAYMENT_METHODS, REPAYMENT_METHOD_LABEL } from "../constants";
import type { DirectoryFilterState } from "../hooks/useLoanDirectory";

interface Props {
  filters: DirectoryFilterState;
  onChange: (patch: Partial<DirectoryFilterState>) => void;
  onClear: () => void;
}

export function DirectoryFilters({ filters, onChange, onClear }: Props) {
  const isFiltered =
    filters.q.trim().length > 0 || filters.status !== "ALL" || filters.lenderType !== "ALL" || filters.method !== "ALL";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <div className="relative w-full min-w-0 sm:w-[300px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={filters.q}
          onChange={(event) => onChange({ q: event.target.value })}
          placeholder="Loan ID, lender or PN"
          aria-label="Search loans"
          className="h-9 pl-8"
        />
      </div>

      <Select value={filters.status} onValueChange={(value) => onChange({ status: value })}>
        <SelectTrigger className="h-9 w-full sm:w-[165px]" aria-label="Filter by loan status">
          <SelectValue className="truncate" placeholder="Every status" />
        </SelectTrigger>
        <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
          <SelectItem value="ALL">Every status</SelectItem>
          {LOAN_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {LOAN_STATUS_LABEL[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.lenderType} onValueChange={(value) => onChange({ lenderType: value })}>
        <SelectTrigger className="h-9 w-full sm:w-[185px]" aria-label="Filter by lender type">
          <SelectValue className="truncate" placeholder="Every lender type" />
        </SelectTrigger>
        <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
          <SelectItem value="ALL">Every lender type</SelectItem>
          {LENDER_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {LENDER_TYPE_LABEL[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.method} onValueChange={(value) => onChange({ method: value })}>
        <SelectTrigger className="h-9 w-full sm:w-[185px]" aria-label="Filter by method">
          <SelectValue className="truncate" placeholder="Every method" />
        </SelectTrigger>
        <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
          <SelectItem value="ALL">Every method</SelectItem>
          {REPAYMENT_METHODS.map((method) => (
            <SelectItem key={method} value={method}>
              {REPAYMENT_METHOD_LABEL[method]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered ? (
        <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 px-2 text-xs" onClick={onClear}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
