"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OptionCombobox } from "./OptionCombobox";

import { EXCEPTION_STATUS_OPTIONS } from "../constants";
import type { CompanyRow } from "../types";

export function VarianceFilters({
  companies,
  company,
  status,
  q,
  onCompany,
  onStatus,
  onSearch,
  onClear,
}: {
  companies: CompanyRow[];
  company: string;
  status: string;
  q: string;
  onCompany: (value: string) => void;
  onStatus: (value: string) => void;
  onSearch: (value: string) => void;
  onClear: () => void;
}) {
  const filtered = company !== "ALL" || status !== "ALL" || q.trim().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <div className="relative w-full min-w-0 sm:w-[280px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="KPI, company or reason"
          aria-label="Search exceptions"
          className="h-9 pl-8"
        />
      </div>

      <OptionCombobox
        value={company}
        onChange={onCompany}
        placeholder="Every company"
        searchPlaceholder="Search companies"
        emptyLabel="No company matches."
        className="h-9 w-full justify-between font-normal sm:w-[210px]"
        options={[
          { value: "ALL", label: "Every company" },
          ...companies.map((row) => ({ value: row.code, label: `${row.code} · ${row.name}` })),
        ]}
      />

      <Select value={status} onValueChange={onStatus}>
        <SelectTrigger className="h-9 w-full sm:w-[180px]" aria-label="Exception state">
          <SelectValue className="truncate" />
        </SelectTrigger>
        <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
          {EXCEPTION_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filtered ? (
        <Button variant="ghost" size="sm" className="h-9 gap-1 px-2 text-xs" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
