"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { LENDER_TYPES, LENDER_TYPE_LABEL } from "../constants";
import type { ApprovalFilters as Filters } from "../hooks/useApprovals";

const QUEUE_STATUS_CHOICES = [
  { value: "ALL", label: "Everything waiting" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
  { value: "PENDING_RELEASE", label: "Awaiting release" },
] as const;

export function ApprovalFilters({
  filters,
  onChange,
  isFiltered,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
  isFiltered: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <div className="relative w-full min-w-0 sm:w-[280px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.q}
          onChange={(event) => onChange({ q: event.target.value })}
          placeholder="Loan no., lender or account"
          aria-label="Search the approvals queue"
          className="h-9 pl-8"
        />
      </div>

      <Select value={filters.status} onValueChange={(value) => onChange({ status: value })}>
        <SelectTrigger className="h-9 w-full sm:w-[200px]" aria-label="Status">
          <SelectValue className="truncate" placeholder="Everything waiting" />
        </SelectTrigger>
        <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
          {QUEUE_STATUS_CHOICES.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.lenderType} onValueChange={(value) => onChange({ lenderType: value })}>
        <SelectTrigger className="h-9 w-full sm:w-[190px]" aria-label="Lender type">
          <SelectValue className="truncate" placeholder="All lenders" />
        </SelectTrigger>
        <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
          <SelectItem value="ALL">All lenders</SelectItem>
          {LENDER_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {LENDER_TYPE_LABEL[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 gap-1 px-2 text-xs"
          onClick={() => onChange({ q: "", status: "ALL", lenderType: "ALL" })}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
