"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "../constants";
import type { PaymentFilters } from "../hooks/usePayments";
import type { LoanOption } from "../types";
import { OptionCombobox } from "./OptionCombobox";

interface Props {
  filters: PaymentFilters;
  loans: LoanOption[];
  onChange: (patch: Partial<PaymentFilters>) => void;
}

export function PaymentsFilters({ filters, loans, onChange }: Props) {
  const isFiltered =
    filters.q.trim().length > 0 || filters.loanId !== null || filters.method !== "ALL" || filters.status !== "ALL";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <div className="relative w-full min-w-0 sm:w-[280px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={filters.q}
          onChange={(event) => onChange({ q: event.target.value })}
          placeholder="Payment no, check no or receipt"
          aria-label="Search payments"
          className="h-9 pl-8"
        />
      </div>

      <OptionCombobox
        value={filters.loanId ? String(filters.loanId) : ""}
        onChange={(value) => onChange({ loanId: value === "" ? null : Number(value) })}
        placeholder="Every loan"
        searchPlaceholder="Search loan no or lender"
        emptyLabel="No loan matches."
        className="h-9 w-full justify-between sm:w-[230px]"
        options={[
          { value: "", label: "Every loan" },
          ...loans.map((loan) => ({
            value: String(loan.id),
            label: `${loan.loanNo} · ${loan.lenderName}`,
            searchText: `${loan.loanNo} ${loan.lenderName}`,
          })),
        ]}
      />

      <Select value={filters.method} onValueChange={(value) => onChange({ method: value })}>
        <SelectTrigger className="h-9 w-full sm:w-[165px]" aria-label="Filter by method">
          <SelectValue className="truncate" placeholder="Every method" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          <SelectItem value="ALL">Every method</SelectItem>
          {PAYMENT_METHODS.map((method) => (
            <SelectItem key={method} value={method}>
              {PAYMENT_METHOD_LABEL[method]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={(value) => onChange({ status: value })}>
        <SelectTrigger className="h-9 w-full sm:w-[165px]" aria-label="Filter by status">
          <SelectValue className="truncate" placeholder="Every status" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          <SelectItem value="ALL">Every status</SelectItem>
          <SelectItem value="POSTED">{PAYMENT_STATUS_LABEL.POSTED}</SelectItem>
          <SelectItem value="REVERSED">{PAYMENT_STATUS_LABEL.REVERSED}</SelectItem>
        </SelectContent>
      </Select>

      {isFiltered ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 gap-1 px-2 text-xs"
          onClick={() => onChange({ q: "", loanId: null, method: "ALL", status: "ALL" })}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
