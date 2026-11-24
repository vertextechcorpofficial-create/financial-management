"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { OptionCombobox } from "./OptionCombobox";

import type { CompanyRow } from "../types";

const CHIPS = [
  { value: "ALL", label: "All" },
  { value: "OPEN_BOARD", label: "Needs action" },
  { value: "MONITORING", label: "Monitoring" },
  { value: "CLOSED", label: "Closed" },
];

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
  const active = CHIPS.some((chip) => chip.value === status) ? status : "ALL";

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Exception state">
        {CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            aria-pressed={active === chip.value}
            onClick={() => onStatus(chip.value)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-xs transition-colors",
              active === chip.value
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="relative w-full min-w-0 sm:w-[240px]">
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
          className="h-9 w-full justify-between font-normal sm:w-[200px]"
          options={[
            { value: "ALL", label: "Every company" },
            ...companies.map((row) => ({ value: row.code, label: `${row.code} · ${row.name}` })),
          ]}
        />

        {filtered ? (
          <Button variant="ghost" size="sm" className="h-9 gap-1 px-2 text-xs" onClick={onClear}>
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
