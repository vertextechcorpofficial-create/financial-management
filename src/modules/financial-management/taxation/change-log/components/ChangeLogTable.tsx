"use client";

import { useState } from "react";
import { Download, FileText, Search } from "lucide-react";

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
import { formatNumber } from "@/lib/utils";

import { ChangeLogDetailDialog } from "./ChangeLogDetailDialog";
import { DateField } from "./DateField";
import { OptionCombobox } from "./OptionCombobox";
import { TablePager } from "./TablePager";
import { CHANGE_LOG_ENTITIES, entityLabel, fieldLabel } from "../constants";
import { phtDisplayStamp } from "../pht";
import { fetchAllChangeLog } from "../providers/changeLogApi";
import { downloadChanges, downloadChangesPdf } from "../utils/exportWorkbook";
import { formatChangeValue } from "../utils/formatValue";
import type { ChangeLogFilter, ChangeLogRow } from "../types";

const COLUMNS = 7;

function display(value: string | null): string {
  return value && value.trim() ? value : "—";
}

/** Stored stamps arrive as raw ISO; the column is labelled PHT, so it prints PHT. */
function displayStamp(value: string | null): string {
  return value && value.trim() ? phtDisplayStamp(value) : "—";
}

function companyAndYear(row: ChangeLogRow, companies: Array<{ companyId: number; name: string }>): string {
  const name = companies.find((entry) => entry.companyId === row.companyId)?.name ?? (row.companyId ? `Company ${row.companyId}` : null);
  if (!name) return row.taxYear ? String(row.taxYear) : "—";
  return row.taxYear ? `${name} · ${row.taxYear}` : name;
}

export function ChangeLogTable({
  rows,
  total,
  companies,
  filters,
  isLoading,
  page,
  pageCount,
  pageSize,
  onFiltersChange,
  onPageChange,
}: {
  rows: ChangeLogRow[];
  total: number;
  companies: Array<{ companyId: number; name: string; code: string }>;
  filters: ChangeLogFilter;
  isLoading: boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  onFiltersChange: (patch: Partial<ChangeLogFilter>) => void;
  onPageChange: (page: number) => void;
}) {
  const [openRow, setOpenRow] = useState<ChangeLogRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  /** A filtered view can span years; the workbook is named for the year the rows carry. */
  const exportYear = filters.year ?? rows[0]?.taxYear ?? new Date().getFullYear();

  async function exportAll(kind: "excel" | "pdf") {
    if (rows.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const targetRows = total > rows.length ? await fetchAllChangeLog(filters) : rows;
      if (kind === "excel") {
        downloadChanges(targetRows, companies, exportYear);
      } else {
        downloadChangesPdf(targetRows, companies, exportYear);
      }
    } finally {
      setIsExporting(false);
    }
  }

  const dirty =
    filters.companyId !== null ||
    filters.entity !== "ALL" ||
    filters.q !== "" ||
    filters.from !== "" ||
    filters.to !== "";

  // The API recomputes `total` under the filters, so `total` alone cannot tell an empty year
  // from a search that matched nothing; the active filters can.
  const emptyLabel = dirty ? "No entry matches these filters." : "No change has been recorded for this year yet.";

  const companyOptions = [
    { value: "ALL", label: "All companies" },
    ...companies.map((company) => ({
      value: String(company.companyId),
      label: company.name,
      searchText: `${company.code} ${company.name}`,
    })),
  ];

  return (
    <section
      aria-label="Taxation change log"
      className="overflow-hidden rounded-2xl border border-border/50 border-t-[3px] border-t-slate-500/70 bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Audit trail</h2>
          <p className="text-xs text-muted-foreground">
            When, who, which entity and record, what changed, from what to what — newest first.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="tabular-nums text-[11px]">
            {formatNumber(total)} entries
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 md:min-h-0"
            onClick={() => void exportAll("excel")}
            disabled={rows.length === 0 || isExporting}
            title="Download these rows as an Excel workbook"
          >
            <Download className="mr-2 size-4" />
            Export Excel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 md:min-h-0"
            onClick={() => void exportAll("pdf")}
            disabled={rows.length === 0 || isExporting}
            title="Download these rows as a PDF report"
          >
            <FileText className="mr-2 size-4" />
            Download PDF
          </Button>
        </div>
      </header>

      <div className="border-b border-border/50 px-4 py-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(200px,1.8fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(event) => onFiltersChange({ q: event.target.value })}
              placeholder="Reference, reason or value"
              className="pl-9"
              aria-label="Search the change log"
            />
          </div>
          <OptionCombobox
            options={companyOptions}
            value={filters.companyId === null ? "ALL" : String(filters.companyId)}
            onChange={(value) => onFiltersChange({ companyId: value === "ALL" ? null : Number(value) })}
            placeholder="All companies"
            searchPlaceholder="Search companies…"
            emptyLabel="No company matches."
          />
          <Select
            value={filters.entity}
            onValueChange={(value) => onFiltersChange({ entity: value })}
          >
            <SelectTrigger aria-label="Transaction Type">
              <SelectValue placeholder="All transaction types" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="ALL">All transaction types</SelectItem>
              {CHANGE_LOG_ENTITIES.map((entity) => (
                <SelectItem key={entity} value={entity}>
                  {entityLabel(entity)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateField
            value={filters.from}
            onChange={(value) => onFiltersChange({ from: value, to: filters.to && value > filters.to ? "" : filters.to })}
            maxDate={filters.to || undefined}
            placeholder="From date"
            aria-label="From date"
          />
          <DateField
            value={filters.to}
            onChange={(value) => onFiltersChange({ to: value })}
            minDate={filters.from || undefined}
            placeholder="To date"
            aria-label="To date"
          />
        </div>
        {dirty && (
          <div className="mt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFiltersChange({ companyId: null, entity: "ALL", q: "", from: "", to: "" })}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[155px]">Date</TableHead>
              <TableHead className="w-[180px]">Company</TableHead>
              <TableHead className="w-[175px]">Transaction Type</TableHead>
              <TableHead className="w-[220px]">Before</TableHead>
              <TableHead className="w-[220px]">After</TableHead>
              <TableHead className="w-[140px]">Modified By</TableHead>
              <TableHead className="w-[160px]">Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell colSpan={COLUMNS}>
                    <div className="h-8 animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS} className="h-24 text-center text-sm text-muted-foreground">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  tabIndex={0}
                  aria-label={`Open change ${row.field ?? row.entity}`}
                  className="cursor-pointer"
                  onClick={() => setOpenRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setOpenRow(row);
                    }
                  }}
                >
                  <TableCell className="tabular-nums text-xs">
                    <span className="block truncate" title={displayStamp(row.occurredAt)}>
                      {displayStamp(row.occurredAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-[170px] truncate" title={companyAndYear(row, companies)}>
                      {companyAndYear(row, companies)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <Badge variant="outline" className="w-fit text-[11px]">
                        {entityLabel(row.entity)}
                      </Badge>
                      {row.field && (
                        <span className="block max-w-[170px] truncate text-xs text-muted-foreground" title={fieldLabel(row.field)}>
                          {fieldLabel(row.field)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="max-w-[240px] whitespace-normal break-words" title={display(row.beforeValue)}>
                      {formatChangeValue(row.beforeValue, row.field)}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="max-w-[240px] whitespace-normal break-words" title={display(row.afterValue)}>
                      {formatChangeValue(row.afterValue, row.field)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-[130px] truncate" title={row.actor ?? undefined}>
                      {display(row.actor)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-[150px] truncate" title={row.reason ?? undefined}>
                      {display(row.reason)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-border/50 xl:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <li key={`skeleton-card-${index}`} className="px-4 py-3">
              <div className="h-10 animate-pulse rounded bg-muted" />
            </li>
          ))
        ) : rows.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </li>
        ) : (
          rows.map((row) => (
            <li
              key={`card-${row.id}`}
              tabIndex={0}
              aria-label={`Open change ${row.field ?? row.entity}`}
              className="cursor-pointer space-y-1 px-4 py-3"
              onClick={() => setOpenRow(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpenRow(row);
                }
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Badge variant="outline" className="shrink-0 text-[11px]">
                    {entityLabel(row.entity)}
                  </Badge>
                  <span className="truncate text-xs text-muted-foreground">{companyAndYear(row, companies)}</span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {displayStamp(row.occurredAt)}
                </span>
              </div>
              <p className="truncate text-sm">
                <span className="font-medium">{fieldLabel(row.field)}</span>
              </p>
              <p className="text-xs whitespace-normal break-words">
                <span className="text-muted-foreground">Before</span> {formatChangeValue(row.beforeValue, row.field)}
                <span className="text-muted-foreground"> → After</span> {formatChangeValue(row.afterValue, row.field)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {display(row.actor)}
                {row.reason ? ` · ${row.reason}` : ""}
              </p>
            </li>
          ))
        )}
      </ul>

      <ChangeLogDetailDialog
        row={openRow}
        companyName={
          openRow ? companies.find((entry) => entry.companyId === openRow.companyId)?.name ?? null : null
        }
        onOpenChange={(open) => {
          if (!open) setOpenRow(null);
        }}
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
