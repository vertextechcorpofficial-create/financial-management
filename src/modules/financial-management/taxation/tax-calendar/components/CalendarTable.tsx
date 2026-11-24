"use client";

import { useState } from "react";
import { CheckCircle2, Download, FileText, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

import { DateField } from "./DateField";
import { NilFilingDialog } from "./NilFilingDialog";
import { TablePager } from "./TablePager";
import { CALENDAR_CATEGORIES, CALENDAR_STATUSES, toneClass, statusTone } from "../constants";
import { phtDisplayDate } from "../pht";
import { downloadDeadlines, downloadDeadlinesPdf } from "../utils/exportWorkbook";
import type { CalendarFilter, CalendarObligation, CalendarStatus } from "../types";

const COLUMNS = 9;

const STATUS_LABEL: Record<CalendarStatus, string> = {
  PAID: "Recorded as paid",
  DUE: "Due",
  OVERDUE: "Overdue",
  UNKNOWN: "Unknown",
  UNVERIFIED: "Source offline",
};

const CATEGORY_LABEL: Record<string, string> = {
  INCOME: "Income tax",
  VAT: "VAT",
  WITHHOLDING: "Withholding",
  OTHER: "Other",
};

export function CalendarTable({
  rows,
  allRows,
  taxYear,
  total,
  filters,
  isLoading,
  page,
  pageCount,
  pageSize,
  today,
  onFiltersChange,
  onPageChange,
  onNilFiled,
}: {
  rows: CalendarObligation[];
  allRows: CalendarObligation[];
  taxYear: number;
  total: number;
  filters: CalendarFilter;
  isLoading: boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  today: string;
  onFiltersChange: (patch: Partial<CalendarFilter>) => void;
  onPageChange: (page: number) => void;
  onNilFiled: () => void;
}) {
  const [nilTarget, setNilTarget] = useState<CalendarObligation | null>(null);
  const dirty =
    filters.category !== "ALL" ||
    filters.status !== "ALL" ||
    filters.from !== "" ||
    filters.to !== "" ||
    filters.q.trim() !== "";

  return (
    <section
      aria-label="Tax calendar"
      className="overflow-hidden rounded-2xl border border-border/50 border-t-[3px] border-t-teal-500/70 bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Filing calendar</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 md:min-h-0"
            onClick={() => downloadDeadlines(allRows, taxYear)}
            disabled={allRows.length === 0}
            title="Download all filtered deadlines as an Excel workbook"
          >
            <Download className="mr-2 size-4" />
            Export Excel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 md:min-h-0"
            onClick={() => downloadDeadlinesPdf(allRows, taxYear)}
            disabled={allRows.length === 0}
            title="Download all filtered deadlines as a PDF schedule"
          >
            <FileText className="mr-2 size-4" />
            Download PDF
          </Button>
        </div>
      </header>

      <div className="border-b border-border/50 px-4 py-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              value={filters.q}
              onChange={(event) => onFiltersChange({ q: event.target.value })}
              placeholder="Form, company or period"
              aria-label="Search deadlines"
            />
          </div>
          <Select value={filters.category} onValueChange={(value) => onFiltersChange({ category: value })}>
            <SelectTrigger aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {CALENDAR_CATEGORIES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(value) => onFiltersChange({ status: value })}>
            <SelectTrigger aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {CALENDAR_STATUSES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateField
            value={filters.from}
            onChange={(value) => onFiltersChange({ from: value })}
            placeholder="Due from"
            aria-label="Due from"
            maxDate={filters.to || undefined}
          />
          <DateField
            value={filters.to}
            onChange={(value) => onFiltersChange({ to: value })}
            placeholder="Due to"
            aria-label="Due to"
            minDate={filters.from || undefined}
          />
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start xl:justify-self-end"
            disabled={!dirty}
            onClick={() => onFiltersChange({ category: "ALL", status: "ALL", from: "", to: "", q: "" })}
          >
            Clear filters
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">Due date</TableHead>
              <TableHead className="w-[180px]">Company</TableHead>
              <TableHead className="w-[100px]">Form</TableHead>
              <TableHead className="w-[130px]">Period</TableHead>
              <TableHead className="w-[120px]">Category</TableHead>
              <TableHead className="w-[150px] text-right">Estimate</TableHead>
              <TableHead className="w-[150px]">Status</TableHead>
              <TableHead className="w-[230px]">Why the date moved</TableHead>
              <TableHead className="w-[140px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell colSpan={COLUMNS}>
                    <div className="h-8 animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS} className="h-24 text-center text-sm text-muted-foreground">
                  No filing matches these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="tabular-nums">
                    <span className="block" title={row.dueDate}>
                      {row.dueDate === today ? `${phtDisplayDate(row.dueDate)} · today` : phtDisplayDate(row.dueDate)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-[170px] truncate" title={row.companyName}>
                      {row.companyName}
                    </span>
                    <span className="block text-xs text-muted-foreground">{row.companyCode}</span>
                  </TableCell>
                  <TableCell className="font-medium">{row.formCode}</TableCell>
                  <TableCell>
                    <span className="block max-w-[120px] truncate" title={row.periodLabel}>
                      {row.periodLabel}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {CATEGORY_LABEL[row.category] ?? row.category}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.estimated === null ? <span className="text-muted-foreground">—</span> : formatCurrency(row.estimated)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] ${toneClass(statusTone(row.status))}`}>
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.moveReason === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="block max-w-[230px] whitespace-normal" title={row.moveReason}>
                        {row.movedFrom === null ? "" : `From ${phtDisplayDate(row.movedFrom)}: `}
                        {row.moveReason}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.status !== "PAID" && row.status !== "UNVERIFIED" && row.estimated === 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setNilTarget(row)}
                        title="Record BIR Filing Reference Number for a zero-tax (Nil) return"
                      >
                        <CheckCircle2 className="mr-1.5 size-3.5" />
                        Mark Nil Filed
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <NilFilingDialog
        obligation={nilTarget}
        taxYear={taxYear}
        onOpenChange={(open) => {
          if (!open) setNilTarget(null);
        }}
        onFiled={onNilFiled}
      />

      <TablePager
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        onPageChange={onPageChange}
        isLoading={isLoading}
        className="border-t border-border/50 px-4 py-3"
      />
    </section>
  );
}


