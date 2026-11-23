"use client";

import type { ReactNode, RefObject } from "react";
import {
  AlertTriangle, Banknote, CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, Landmark, RefreshCw, SearchX, ShieldAlert, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { date, peso } from "../../members/format";
import { StatusChip } from "../components/ui";
import { cashEvidenceLabels, reportMenu, type CashEvidenceContext, type ReportCell, type ReportKey, type ReportNotice, type ReportPage, type ReportRow, type ReportTablePage } from "./types";
import { reportGroups, reportMetadataHighlights, reportTotalsHighlights, reportUi } from "./report-ui";

export function ReportSelector({ report, onSelect }: { report: ReportKey; onSelect: (report: ReportKey) => void }) {
  return <>
    <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
      <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
        Report
        <NativeSelect value={report} onChange={event => onSelect(event.target.value as ReportKey)} className="h-9 w-full">
          {reportGroups.map(group => <optgroup key={group.key} label={group.label}>
            {group.reports.map(key => <option key={key} value={key}>{reportMenu[key].label}</option>)}
          </optgroup>)}
        </NativeSelect>
      </label>
    </div>
    <nav aria-label="Reports" className="sticky top-0 z-20 -mx-4 hidden border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:block">
      <div className="flex items-center gap-1 overflow-x-auto">
        {reportGroups.map((group, groupIndex) => <div key={group.key} className="flex shrink-0 items-center gap-1">
          {groupIndex > 0 && <span className="mx-1 hidden h-6 w-px shrink-0 bg-border min-[1400px]:block" />}
          {group.reports.map(key => {
            const { shortLabel, icon: Icon } = reportUi[key];
            const active = report === key;
            return <button key={key} type="button" aria-current={active ? "page" : undefined} title={reportMenu[key].label}
              onClick={() => onSelect(key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                active
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}>
              <Icon className="size-3.5" /> {shortLabel}
            </button>;
          })}
        </div>)}
      </div>
    </nav>
  </>;
}

export function ReportHeader({ report, data, loading, exportReady, working, stale, copyButtonRef, onRefresh, onExport }: {
  report: ReportKey;
  data?: ReportPage;
  loading: boolean;
  exportReady: boolean;
  working?: "csv" | "tsv";
  stale?: boolean;
  copyButtonRef: RefObject<HTMLButtonElement | null>;
  onRefresh: () => void;
  onExport: (format: "csv" | "tsv") => void;
}) {
  const Icon = reportUi[report].icon;
  const exportTitle = stale ? "Refresh the report before exporting."
    : !data ? "Load the report first." : data.blocked ? "This report is unavailable."
      : !data.count ? "No rows to export." : working ? "Export in progress." : undefined;
  const meta = data
    ? data.blocked ? "Report temporarily unavailable"
      : `${data.count} row${data.count === 1 ? "" : "s"} · Generated ${date(data.generatedOn)}`
    : loading ? "Loading report…" : "Run the report to see results.";
  return <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cooperative report</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{reportMenu[report].label}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{reportMenu[report].description}</p>
          <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
        </div>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onRefresh} disabled={loading || Boolean(working)}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh report
        </Button>
        <Button type="button" variant="outline" className="w-full sm:w-auto" ref={copyButtonRef}
          disabled={!exportReady} title={exportTitle} onClick={() => onExport("tsv")}>
          <Copy className="size-4" /> {working === "tsv" ? "Copying…" : "Copy as spreadsheet"}
        </Button>
        <Button type="button" className="w-full sm:w-auto" disabled={!exportReady} title={exportTitle} onClick={() => onExport("csv")}>
          <Download className="size-4" /> {working === "csv" ? "Downloading…" : "Download CSV"}
        </Button>
      </div>
    </div>
  </section>;
}

type Fact = { label: string; value: ReactNode; detail?: string; kind?: "text" | "money" | "chip" };

function statusChipValue(value: string) {
  const key = value === "Active" ? "ACTIVE" : value === "Separated" ? "SEPARATED" : value === "Applied" ? "APPLIED" : value === "Non-member" ? "NON_MEMBER" : "";
  return key ? <StatusChip status={key} label={value} /> : value;
}

function buildFacts(report: ReportKey, data: ReportPage): Fact[] {
  const facts: Fact[] = [];
  const metadata = new Map(data.metadata);
  const addRows = () => {
    if (facts.length < 4) facts.push({ label: "Rows", value: data.count, detail: "Filtered results", kind: "text" });
  };

  if (report === "soa") {
    for (const label of reportMetadataHighlights.soa ?? []) {
      const value = metadata.get(label);
      if (!value) continue;
      facts.push(label === "Status"
        ? { label, value: statusChipValue(value), kind: "chip" }
        : { label, value });
    }
    const from = metadata.get("From");
    const to = metadata.get("To");
    if (from && to) facts.push({ label: "Period", value: `${date(from)} – ${date(to)}` });
    addRows();
    return facts;
  }

  if (report === "trial-balance") {
    for (const label of reportMetadataHighlights["trial-balance"] ?? []) {
      const value = metadata.get(label);
      if (!value) continue;
      facts.push({ label, value: value === "Balanced" ? <StatusChip status="ACTIVE" label="Balanced" />
        : value === "Out of balance" ? <StatusChip status="REJECTED" label="Out of balance" /> : value, kind: "chip" });
    }
    addRows();
    return facts;
  }

  if (report === "month-end") {
    for (const label of reportMetadataHighlights["month-end"] ?? []) {
      const value = metadata.get(label);
      if (value === undefined) continue;
      facts.push({ label, value: peso(value), kind: "money" });
    }
    addRows();
    return facts;
  }

  if (report === "audit") {
    for (const label of ["From", "To"]) {
      const value = metadata.get(label);
      if (value) facts.push({ label, value: date(value) });
    }
    addRows();
    return facts;
  }

  if (report === "docs") {
    const types = new Set(data.rows.map(row => String(row.cells[0] ?? "")).filter(Boolean));
    facts.push({ label: "Records needing attention", value: data.count, detail: "Missing required documents" });
    facts.push({ label: "Record types", value: types.size, detail: "On this page" });
    return facts;
  }

  for (const label of reportTotalsHighlights[report] ?? []) {
    const index = data.columns.findIndex(column => column.label === label);
    const value = index >= 0 ? data.totals[index] : null;
    if (value === null || value === undefined || value === "") continue;
    facts.push({ label, value: peso(String(value)), detail: "Report total", kind: "money" });
  }
  addRows();
  return facts;
}

export function ReportFacts({ report, data }: { report: ReportKey; data: ReportPage }) {
  const facts = buildFacts(report, data);
  if (!facts.length) return null;
  return <section aria-label="Report summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {facts.map(fact => <div key={fact.label} className="rounded-xl border bg-card p-3 shadow-xs">
      <p className="text-[11px] font-medium text-muted-foreground">{fact.label}</p>
      {fact.kind === "chip"
        ? <div className="mt-1">{fact.value}</div>
        : <div className={cn("mt-1 truncate text-lg font-semibold", fact.kind === "money" && "font-mono tabular-nums")}>{fact.value}</div>}
      {fact.detail && <p className="mt-0.5 text-xs text-muted-foreground">{fact.detail}</p>}
    </div>)}
  </section>;
}

export function ReportFactsSkeleton() {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
    {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl border bg-muted/30" />)}
  </div>;
}

export function ReportFilterPanel({ children, count, loading, hasFilters, onClear }: {
  children: ReactNode;
  count?: number;
  loading: boolean;
  hasFilters: boolean;
  onClear: () => void;
}) {
  return <section className="rounded-xl border bg-muted/20 p-3">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
      <p className="text-xs text-muted-foreground">
        {loading ? "Updating report…" : `${count ?? 0} row${count === 1 ? "" : "s"} match`}
      </p>
      {hasFilters && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onClear}>
        <X className="size-3.5" /> Clear filters
      </Button>}
    </div>
  </section>;
}

export function FilterField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={cn("space-y-1.5 text-[11px] font-medium text-muted-foreground", className)}>
    <span className="block">{label}</span>
    {children}
  </label>;
}

export function ReportErrorAlert({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
    <AlertTriangle className="size-4 shrink-0 text-destructive" />
    <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button>
  </div>;
}

export function ReportNoticeAlert({ notice, onRetry }: { notice: ReportNotice; onRetry: () => void }) {
  const unavailable = notice.state === "unavailable";
  return <div role={unavailable ? "alert" : "status"} className={cn(
    "flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm",
    unavailable
      ? "border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
      : "border-amber-300 bg-amber-50/70 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  )}>
    <AlertTriangle className="size-4 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="font-medium">{notice.label}</p>
      <p className="text-xs opacity-90">{notice.message}</p>
    </div>
    {unavailable && <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button>}
  </div>;
}

export function ReportBlocked({ notices, onRetry }: { notices?: ReportNotice[]; onRetry: () => void }) {
  return <section className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
    <div className="flex items-start gap-3">
      <ShieldAlert className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">Report unavailable</h3>
        <p className="mt-0.5 text-sm opacity-90">One or more sources could not be loaded, so this report cannot be generated.</p>
        {!!notices?.length && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {notices.map(notice => <li key={notice.label}>{notice.label} · {notice.message}</li>)}
        </ul>}
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>Retry</Button>
      </div>
    </div>
  </section>;
}

export function ReportExportFeedback({ message, onRefresh }: {
  message?: { message: string; error?: boolean; stale?: boolean };
  onRefresh: () => void;
}) {
  if (!message) return null;
  return <div role={message.error ? "alert" : "status"} className={cn(
    "flex flex-wrap items-start gap-3 rounded-xl border p-3 text-sm",
    message.error
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  )}>
    {message.error ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
    <p className="min-w-0 flex-1">{message.message}</p>
    {message.stale && <Button type="button" variant="outline" size="sm" onClick={onRefresh}>Refresh report</Button>}
  </div>;
}

export function ReportMemberEmpty() {
  return <section className="flex flex-col items-center gap-2 rounded-xl border bg-card px-4 py-10 text-center">
    <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><SearchX className="size-5" /></span>
    <p className="text-sm font-medium">Select a member</p>
    <p className="max-w-sm text-xs text-muted-foreground">Choose a member from the filter above to generate their statement of account.</p>
  </section>;
}

export function ReportEvidencePanel({ rows, saved, onEdit }: {
  rows: CashEvidenceContext[];
  saved: string;
  onEdit: (row: CashEvidenceContext) => void;
}) {
  return <section className="rounded-xl border bg-card p-4">
    <div>
      <h3 className="text-sm font-semibold">Month-end evidence</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">Record the verified cash and bank balances used in this comparison.</p>
    </div>
    {saved && <p role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {saved}
    </p>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {rows.map(row => {
        const Icon = row.purpose === "CASH_ON_HAND" ? Banknote : Landmark;
        const recorded = row.revision > 0;
        return <div key={row.purpose} className="rounded-xl border bg-muted/20 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground"><Icon className="size-4" /></span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{cashEvidenceLabels[row.purpose]}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{row.accountLabel} · As of {date(row.periodEnd)}</p>
              </div>
            </div>
            <StatusChip status={recorded ? "ACTIVE" : "PARTIAL"} label={recorded ? "Recorded" : "Not recorded"} />
          </div>
          {recorded && <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div><p className="text-[11px] text-muted-foreground">Amount</p><p className="font-mono tabular-nums">{row.amount === null ? "—" : peso(row.amount)}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Reference</p><p className="truncate">{row.reference ?? "—"}</p></div>
          </div>}
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => onEdit(row)}>
            {recorded ? "Correct" : "Record"} {cashEvidenceLabels[row.purpose].toLowerCase()}
          </Button>
        </div>;
      })}
    </div>
  </section>;
}

export function ReportTableSkeleton({ rows = 8, title }: { rows?: number; title?: string }) {
  return <section className="space-y-3" aria-busy="true">
    {title && <div className="h-4 w-32 animate-pulse rounded bg-muted" />}
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader><TableRow>{Array.from({ length: 6 }, (_, index) =>
          <TableHead key={index}><div className="h-3.5 w-20 animate-pulse rounded bg-muted" /></TableHead>)}</TableRow></TableHeader>
        <TableBody>{Array.from({ length: rows }, (_, row) => <TableRow key={row} className="hover:bg-transparent">
          {Array.from({ length: 6 }, (_, cell) => <TableCell key={cell}>
            <div className={cn("h-3.5 animate-pulse rounded bg-muted", cell === 0 ? "w-24" : "w-16")} />
          </TableCell>)}
        </TableRow>)}</TableBody>
      </Table>
    </div>
  </section>;
}

export function ReportTable({ data, title, emptyMessage, onPage }: {
  data: ReportTablePage;
  title?: string;
  emptyMessage: string;
  onPage: (page: number) => void;
}) {
  const first = data.count ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = first ? first + data.rows.length - 1 : 0;
  const classFor = (index: number) => {
    const kind = data.columns[index].kind;
    return kind === "money" || kind === "number" ? "whitespace-nowrap text-right font-mono tabular-nums" : "whitespace-normal";
  };
  const cell = (value: ReportCell, index: number) => {
    if (value === null) return "";
    if (data.columns[index].kind === "money") return peso(value);
    if (data.columns[index].kind === "date") return date(String(value));
    return value;
  };
  const cells = (values: ReportCell[], surface: "body" | "opening" | "totals", changes?: ReportRow["changes"]) =>
    values.map((value, index) => {
      const sticky = index === 0 ? "lg:sticky lg:left-0 lg:z-10 border-r" : "";
      const background = index === 0
        ? surface === "opening" ? "bg-muted/40" : surface === "totals" ? "bg-muted/30" : "bg-card group-hover:bg-muted/50"
        : "";
      const text = value === null ? "" : String(value);
      const dateLike = data.columns[index].kind === "date" || /\b\d{1,2}:\d{2}/.test(text) || /^\d{4}-\d{2}-\d{2}/.test(text);
      const identifier = index === 0 && !/^(employee|member)$/i.test(data.columns[index].label);
      return <TableCell className={cn(classFor(index), (dateLike || identifier) && "whitespace-nowrap", sticky, background)} key={index}>
        {data.columns[index].kind === "changes" && changes?.length ? <details className="min-w-36">
          <summary className="inline-flex cursor-pointer items-center rounded-md border bg-background px-2 py-0.5 text-xs font-medium">View changes ({changes.length})</summary>
          <div className="min-w-64 space-y-2 pt-2">
            {changes.map((change, changeIndex) => <div className="border-t pt-2" key={changeIndex}>
              <div className="font-medium">{change.field}</div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs break-words">
                <dt className="text-muted-foreground">Before</dt><dd>{change.before ?? "—"}</dd>
                <dt className="text-muted-foreground">After</dt><dd>{change.after ?? "—"}</dd>
              </dl>
            </div>)}
          </div>
        </details> : cell(value, index)}
      </TableCell>;
    });

  return <section className="space-y-3" aria-label={title ? title + " report" : "Report results"}>
    {title && <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{data.count} row{data.count === 1 ? "" : "s"}</span>
    </div>}
    <div className="overflow-x-auto rounded-xl border" role="region" aria-label={title ? title + " table" : "Report table"} tabIndex={0}>
      <Table aria-label={title ?? "Report data"}>
        <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">{data.columns.map((column, index) =>
          <TableHead className={cn(classFor(index), "whitespace-nowrap", index === 0 && "lg:sticky lg:left-0 lg:z-20 border-r bg-muted")} scope="col" key={column.label}>{column.label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {data.opening && <TableRow className="group bg-muted/40 hover:bg-muted/40">{cells(data.opening, "opening")}</TableRow>}
          {!data.rows.length && <TableRow className="hover:bg-transparent"><TableCell colSpan={data.columns.length}>
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><SearchX className="size-5" /></span>
              <p className="text-sm font-medium">{emptyMessage}</p>
            </div>
          </TableCell></TableRow>}
          {data.rows.map(row => <TableRow key={row.id} className="group">{cells(row.cells, "body", row.changes)}</TableRow>)}
        </TableBody>
        {!!data.totals.length && <TableFooter><TableRow className="group bg-muted/30 hover:bg-muted/30">{cells(data.totals, "totals")}</TableRow></TableFooter>}
      </Table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{first ? `Showing ${first}–${last} of ${data.count}` : "No rows"}</span>
      {data.count > data.pageSize && <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
          <ChevronLeft className="size-3.5" /> Previous
        </Button>
        <span className="min-w-14 text-center font-medium text-foreground">Page {data.page}</span>
        <Button type="button" size="sm" variant="outline" disabled={last >= data.count} onClick={() => onPage(data.page + 1)}>
          Next <ChevronRight className="size-3.5" />
        </Button>
      </div>}
    </div>
  </section>;
}
