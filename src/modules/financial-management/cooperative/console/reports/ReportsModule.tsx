"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoanMemberSelect } from "../../loans/LoanMemberSelect";
import { memberFetch } from "../../members/client";
import { copyCooperativeText } from "../../members/copyText";
import { date, isCalendarDate, peso, todayManila } from "../../members/format";
import { statementPeriods } from "../../members/statement";
import type { StatementPeriod } from "../../members/types";
import type { getReportMemberChoices } from "../../server/member-reports";
import { channelLabels } from "../../transactions/entries";
import { EmptyState, FilterBar, Panel } from "../components/ui";
import { CashEvidenceDialog } from "./CashEvidenceDialog";
import { monthPeriod } from "./report-dates";
import { cashEvidenceLabels, reportLoanStatuses, reportMenu, reportRecordTypes, sectionPageParams, type CashEvidenceContext,
  type ReportCell, type ReportKey, type ReportPage, type ReportRow, type ReportTablePage } from "./types";

const endpoint = "/api/fm/cooperative/reports";
type Choices = Awaited<ReturnType<typeof getReportMemberChoices>>;
type ExportFormat = "csv" | "tsv";
const firstDetailPages = { loans: 1, activity: 1, remittances: 1 };

function useReportRequest<T>(path: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ path: string; attempt: number; data?: T; error?: string; previous?: T }>();

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      memberFetch<T>(path, { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted) setState({ path, attempt, data });
      }).catch(error => {
        if (!controller.signal.aborted) setState(current => ({
          path, attempt, previous: current?.data ?? current?.previous,
          error: error instanceof Error ? error.message : "Unable to load the report.",
        }));
      });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [path, attempt]);

  const current = path && state?.path === path && state.attempt === attempt ? state : undefined;
  return {
    data: current?.data, error: current?.error, previous: state?.data ?? state?.previous,
    loading: Boolean(path && !current), reload: () => setAttempt(value => value + 1),
  };
}

export default function ReportsModule() {
  const [report, setReport] = useState<ReportKey>("soa");

  return <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="flex min-w-0 gap-1 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Reports">
        {(Object.keys(reportMenu) as ReportKey[]).map(key => <button key={key} type="button"
          aria-current={report === key ? "true" : undefined} onClick={() => setReport(key)}
          className={"min-w-44 rounded-lg border p-3 text-left text-sm transition-colors lg:min-w-0 " +
            (report === key ? "border-primary bg-primary/5" : "bg-card hover:border-primary/50")}>
          <span className="block font-medium">{reportMenu[key].label}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{reportMenu[key].description}</span>
        </button>)}
      </nav>
      <ReportView key={report} report={report} />
    </div>
  </main>;
}

function ReportMemberPicker({ member, onSelect }: { member?: Choices["members"][number]; onSelect: (value?: Choices["members"][number]) => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ q, page: String(page) });
  const choices = useReportRequest<Choices>(endpoint + "/members?" + params);
  return <div className="min-w-48 flex-1 space-y-1 sm:max-w-72">
    <span className="block text-xs font-medium text-muted-foreground">Member</span>
    <LoanMemberSelect
      member={member} members={choices.data?.members ?? []} page={page} hasMore={choices.data?.hasMore ?? false}
      loading={choices.loading} error={choices.error} search={q} onSearchChange={value => { setQ(value); setPage(1); }}
      onPageChange={setPage} onRetry={choices.reload} onSelect={onSelect} emptyMessage="No memberships match this search."
    />
  </div>;
}

function ReportView({ report }: { report: ReportKey }) {
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [product, setProduct] = useState("");
  const [channel, setChannel] = useState("");
  const [recordType, setRecordType] = useState("");
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [detailPages, setDetailPages] = useState(firstDetailPages);
  const [member, setMember] = useState<Choices["members"][number]>();
  const periods = statementPeriods(todayManila());
  const lastMonth = periods["Last month"].to.slice(0, 7);
  const [month, setMonth] = useState(lastMonth);
  const [editingEvidence, setEditingEvidence] = useState<CashEvidenceContext>();
  const [savedEvidence, setSavedEvidence] = useState("");
  const [period, setPeriod] = useState<StatementPeriod>(() => {
    if (report === "portfolio") return { from: "", to: "" };
    if (report === "savings" || report === "collections") return periods["Year to date"];
    if (report === "trial-balance") return periods["Last month"];
    if (report === "audit") return periods["This month"];
    return { from: periods["Last month"].from, to: periods["This month"].to };
  });
  const [preset, setPreset] = useState("");
  const [working, setWorking] = useState<ExportFormat>();
  const [feedback, setFeedback] = useState<{ fingerprint: string; message: string; error?: boolean; stale?: boolean }>();
  const copyButton = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const abortExport = useRef<AbortController | null>(null);
  const statement = report === "soa";
  const portfolio = report === "portfolio";
  const collections = report === "collections";
  const trial = report === "trial-balance";
  const monthEnd = report === "month-end";
  const audit = report === "audit";
  const hasProduct = portfolio || collections || report === "aging";
  const hasPeriod = statement || report === "savings" || portfolio || collections || trial || audit;
  const invalidFrom = !isCalendarDate(period.from) && (!portfolio || Boolean(period.from));
  const invalidTo = !isCalendarDate(period.to) && (!portfolio || Boolean(period.to));
  const rangeError = monthEnd && (!monthPeriod(month) || month > lastMonth) ? "Choose a completed Manila calendar month." :
    !hasPeriod ? "" : invalidFrom || invalidTo
    ? "Enter valid From and To dates." : period.from && period.to && period.from > period.to ? "From must be on or before To." : "";
  const params = new URLSearchParams({ report, page: String(page) });
  if (statement && member) {
    params.set("member", String(member.id));
    params.set(sectionPageParams.loans, String(detailPages.loans));
    params.set(sectionPageParams.activity, String(detailPages.activity));
  }
  if (monthEnd) {
    params.set("month", month);
    params.set(sectionPageParams.remittances, String(detailPages.remittances));
  }
  if (audit) {
    if (actorId) params.set("actorId", actorId);
    if (action) params.set("action", action);
  }
  if (hasPeriod) {
    params.set("from", period.from);
    params.set("to", period.to);
  }
  if (!statement && q.trim()) params.set("q", q.trim());
  if (!statement && department) params.set("department", department);
  if (status) params.set("status", status);
  if (product) params.set("product", product);
  if (channel) params.set("channel", channel);
  if (recordType) params.set("recordType", recordType);
  const path = rangeError || (statement && !member) ? null : endpoint + "?" + params;
  const { data, previous, loading, error, reload } = useReportRequest<ReportPage>(path);
  const message = feedback?.fingerprint === data?.fingerprint ? feedback : undefined;
  const exportReady = Boolean(data && !data.blocked && (data.count || statement) && !working && !message?.stale);

  useEffect(() => () => abortExport.current?.abort(), [path]);

  function resetPages() {
    setPage(1);
    setDetailPages(firstDetailPages);
    setFeedback(undefined);
  }

  function changePeriod(next: StatementPeriod, selected = "") {
    setPeriod(next);
    setPreset(selected);
    if (audit) {
      setActorId("");
      setAction("");
    }
    resetPages();
  }

  function refreshReport() {
    abortExport.current?.abort();
    setFeedback(undefined);
    reload();
  }

  async function exportReport(format: ExportFormat) {
    if (!data || !exportReady) return;
    const { fingerprint } = data;
    const controller = new AbortController();
    abortExport.current = controller;
    setWorking(format);
    setFeedback(undefined);
    try {
      params.set("format", format);
      params.set("fingerprint", fingerprint);
      params.delete("page");
      Object.values(sectionPageParams).forEach(name => params.delete(name));
      const response = await fetch(endpoint + "?" + params, { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        setFeedback({ fingerprint, message: error?.message ?? "Unable to export the report.",
          error: true, stale: error?.code === "REPORT_CHANGED" });
        return;
      }
      if (format === "tsv") {
        const text = await response.text();
        if (controller.signal.aborted || !container.current) return;
        const copied = await copyCooperativeText(text, container.current, copyButton.current);
        setFeedback({ fingerprint, message: copied ? "Report copied to clipboard." : "Copy was blocked by the browser. Try again or download the CSV.",
          error: !copied });
      } else {
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        const filename = response.headers.get("Content-Disposition")?.match(/filename="([a-z0-9-]+\.csv)"/i)?.[1];
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename ?? "cooperative-report.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setFeedback({ fingerprint, message: "CSV downloaded." });
      }
    } catch {
      if (!controller.signal.aborted) setFeedback({ fingerprint, message: "Unable to export the report. Try again.", error: true });
    } finally {
      abortExport.current = null;
      setWorking(undefined);
    }
  }

  return <Panel title={reportMenu[report].label} description={reportMenu[report].description} actions={
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" ref={copyButton} disabled={!exportReady}
        onClick={() => void exportReport("tsv")}>{working === "tsv" ? "Copying…" : "Copy as spreadsheet"}</Button>
      <Button type="button" size="sm" variant="outline" disabled={!exportReady}
        onClick={() => void exportReport("csv")}>{working === "csv" ? "Downloading…" : "Download CSV"}</Button>
    </div>
  }>
    <div ref={container} className="space-y-3">
      {message && <div role={message.error ? "alert" : "status"} className="flex flex-wrap items-center gap-2 text-sm">
        <span className={message.error ? "text-destructive" : "text-muted-foreground"}>{message.message}</span>
        {message.stale && <Button type="button" size="sm" variant="outline" onClick={refreshReport}>Refresh report</Button>}
      </div>}
      {monthEnd && savedEvidence && <p role="status" className="text-sm text-muted-foreground">{savedEvidence}</p>}
      <FilterBar count={data?.count}>
        {statement ? <ReportMemberPicker member={member} onSelect={value => {
          setMember(value);
          resetPages();
        }} /> : !trial && !monthEnd && <>
          <label className="min-w-36 space-y-1 text-xs font-medium text-muted-foreground">
            <span className="block">{audit ? "Record reference" : "Search"}</span>
            <Input className="h-8" value={q} onChange={event => { setQ(event.target.value); resetPages(); }}
              placeholder={audit ? "Agreement, loan, journal, or record ID" : hasProduct || report === "docs" ? "Member or reference" :
                report === "savings" ? "Name or employee no." : "Name, employee no. or agreement"} maxLength={120} />
          </label>
          {!audit && <label className="min-w-36 space-y-1 text-xs font-medium text-muted-foreground">
            <span className="block">Department</span>
            <NativeSelect className="h-8 w-full" value={department} onChange={event => {
              setDepartment(event.target.value); resetPages();
            }}>
              <option value="">All departments</option>
              {(previous?.departments ?? []).map(name => <option key={name}>{name}</option>)}
            </NativeSelect>
          </label>}
          {audit && <>
            <label className="min-w-36 space-y-1 text-xs font-medium text-muted-foreground">
              <span className="block">Actor</span>
              <NativeSelect className="h-8 w-full" value={actorId} onChange={event => { setActorId(event.target.value); resetPages(); }}>
                <option value="">All actors</option>
                {(previous?.actors ?? []).map(actor => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
              </NativeSelect>
            </label>
            <label className="min-w-36 space-y-1 text-xs font-medium text-muted-foreground">
              <span className="block">Action</span>
              <NativeSelect className="h-8 w-full" value={action} onChange={event => { setAction(event.target.value); resetPages(); }}>
                <option value="">All actions</option>
                {(previous?.actions ?? []).map(action => <option key={action.code} value={action.code}>{action.name}</option>)}
              </NativeSelect>
            </label>
          </>}
          {(report === "savings" || report === "roster") && <label className="min-w-36 space-y-1 text-xs font-medium text-muted-foreground">
            <span className="block">Membership status</span>
            <NativeSelect className="h-8 w-full" value={status} onChange={event => {
              setStatus(event.target.value); resetPages();
            }}>
              <option value="">All statuses</option>
              <option value="MEMBER">Member</option>
              {report === "roster" && <option value="NON_MEMBER">Not a member</option>}
              <option value="SEPARATED">Separated</option>
            </NativeSelect>
          </label>}
          {hasProduct && <label className="min-w-36 space-y-1 text-xs font-medium text-muted-foreground">
            <span className="block">Product</span>
            <NativeSelect className="h-8 w-full" value={product} onChange={event => { setProduct(event.target.value); resetPages(); }}>
              <option value="">All products</option>
              {(previous?.products ?? []).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </NativeSelect>
          </label>}
          {portfolio && <label className="min-w-36 space-y-1 text-xs font-medium text-muted-foreground">
            <span className="block">Loan status</span>
            <NativeSelect className="h-8 w-full" value={status} onChange={event => { setStatus(event.target.value); resetPages(); }}>
              <option value="">All statuses</option>
              {Object.entries(reportLoanStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </NativeSelect>
          </label>}
          {collections && <label className="min-w-36 space-y-1 text-xs font-medium text-muted-foreground">
            <span className="block">Channel</span>
            <NativeSelect className="h-8 w-full" value={channel} onChange={event => { setChannel(event.target.value); resetPages(); }}>
              <option value="">All channels</option>
              {Object.entries(channelLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </NativeSelect>
          </label>}
          {report === "docs" && <label className="min-w-36 space-y-1 text-xs font-medium text-muted-foreground">
            <span className="block">Record type</span>
            <NativeSelect className="h-8 w-full" value={recordType} onChange={event => { setRecordType(event.target.value); resetPages(); }}>
              <option value="">All records</option>
              {Object.entries(reportRecordTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </NativeSelect>
          </label>}
        </>}
        {monthEnd && <label className="space-y-1 text-xs font-medium text-muted-foreground">
          <span className="block">Month</span>
          <Input className="h-8" type="month" value={month} max={lastMonth} onChange={event => {
            setMonth(event.target.value);
            setEditingEvidence(undefined);
            setSavedEvidence("");
            resetPages();
          }} />
        </label>}
        {statement && <label className="min-w-36 space-y-1 text-xs font-medium text-muted-foreground">
          <span className="block">Period</span>
          <NativeSelect className="h-8 w-full" value={preset} onChange={event => {
            const name = event.target.value as keyof typeof periods | "";
            changePeriod(name ? periods[name] : period, name);
          }}>
            <option value="">Custom</option>
            {Object.keys(periods).map(name => <option key={name}>{name}</option>)}
          </NativeSelect>
        </label>}
        {hasPeriod && <>
          <label className="space-y-1 text-xs font-medium text-muted-foreground"><span className="block">{portfolio ? "Released from" : "From"}</span>
            <Input className="h-8" type="date" value={period.from} onChange={event => changePeriod({ ...period, from: event.target.value })} />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground"><span className="block">{portfolio ? "Released to" : "To"}</span>
            <Input className="h-8" type="date" value={period.to} onChange={event => changePeriod({ ...period, to: event.target.value })} />
          </label>
        </>}
      </FilterBar>
      {rangeError && <p role="alert" className="text-sm text-destructive">{rangeError}</p>}
      {statement && !member && !rangeError && <EmptyState>Select a member to view their statement.</EmptyState>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading report…</p>}
      {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        {error}<Button type="button" size="sm" variant="outline" onClick={refreshReport}>Retry</Button>
      </div>}
      {data?.notices?.map(notice => <div key={notice.label} role={notice.state === "unavailable" ? "alert" : "status"}
        className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/30 p-3 text-sm">
        <span className="font-medium">{notice.label}</span>
        <span className="text-muted-foreground">{notice.message}</span>
        {notice.state === "unavailable" && <Button type="button" size="sm" variant="outline" onClick={refreshReport}>Retry</Button>}
      </div>)}
      {data && !data.blocked && <>
        {!!data.metadata.length && <dl className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.metadata.map(([label, value]) => <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-medium">{value}</dd>
          </div>)}
        </dl>}
        {!!data.cashEvidence?.length && <div className="flex flex-wrap gap-2">
          {data.cashEvidence.map(evidence => <Button type="button" size="sm" variant="outline" key={evidence.purpose}
            onClick={() => { setSavedEvidence(""); setEditingEvidence(evidence); }}>
            {evidence.revision ? "Correct " : "Record "}{cashEvidenceLabels[evidence.purpose].toLowerCase()}
          </Button>)}
        </div>}
        <ReportTable data={data} title={statement ? "Savings" : undefined} onPage={setPage}
          emptyMessage={statement ? "No savings activity in this period." : "No rows match these filters."} />
        {data.sections?.map(section => <ReportTable key={section.key} data={section} title={section.label}
          onPage={page => setDetailPages(current => ({ ...current, [section.key]: page }))}
          emptyMessage={section.key === "loans" ? "No loan balances or activity in this period." :
            section.key === "activity" ? "No loan activity in this period." : "No verified remittances in this period."} />)}
        <p className="text-xs text-muted-foreground">Generated {date(data.generatedOn)}</p>
      </>}
      {editingEvidence && <CashEvidenceDialog evidence={editingEvidence}
        onClose={() => setEditingEvidence(undefined)}
        onSave={() => { setEditingEvidence(undefined); setSavedEvidence("Evidence saved."); refreshReport(); }}
        onRefresh={() => { setEditingEvidence(undefined); refreshReport(); }} />}
    </div>
  </Panel>;
}

function ReportTable({ data, title, emptyMessage, onPage }: {
  data: ReportTablePage; title?: string; emptyMessage: string; onPage: (page: number) => void;
}) {
  const first = data.count ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = first ? first + data.rows.length - 1 : 0;
  const cell = (value: ReportCell, index: number) => {
    if (value === null) return "";
    if (data.columns[index].kind === "money") return peso(value);
    if (data.columns[index].kind === "date") return date(String(value));
    return value;
  };
  const classFor = (index: number) => {
    const kind = data.columns[index].kind;
    return kind === "money" || kind === "number" ? "text-right font-mono tabular-nums" : "whitespace-normal";
  };
  const cells = (values: ReportCell[], changes?: ReportRow["changes"]) => values.map((value, index) =>
    <TableCell className={classFor(index)} key={index}>
      {data.columns[index].kind === "changes" && changes?.length ? <details className="min-w-36">
        <summary className="cursor-pointer text-sm">View changes ({changes.length})</summary>
        <div className="min-w-64 space-y-2 pt-2">
          {changes.map((change, index) => <div className="border-t pt-2" key={index}>
            <div className="font-medium">{change.field}</div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs break-words">
              <dt className="text-muted-foreground">Before</dt><dd>{change.before ?? "—"}</dd>
              <dt className="text-muted-foreground">After</dt><dd>{change.after ?? "—"}</dd>
            </dl>
          </div>)}
        </div>
      </details> : cell(value, index)}
    </TableCell>);

  return <section className="space-y-3" aria-label={title ?? "Report results"}>
    {title && <h3 className="text-sm font-semibold">{title}</h3>}
    <div className="overflow-x-auto rounded-md border [&>[data-slot=table-container]]:overflow-visible"
      role="region" aria-label={title ? title + " table" : "Report table"} tabIndex={0}>
      <Table aria-label={title ?? "Report data"}>
        <TableHeader><TableRow>{data.columns.map((column, index) =>
          <TableHead className={classFor(index)} scope="col" key={column.label}>{column.label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {data.opening && <TableRow className="bg-muted/40">{cells(data.opening)}</TableRow>}
          {!data.rows.length && <TableRow><TableCell colSpan={data.columns.length}>
            <EmptyState>{emptyMessage}</EmptyState>
          </TableCell></TableRow>}
          {data.rows.map(row => <TableRow key={row.id}>{cells(row.cells, row.changes)}</TableRow>)}
        </TableBody>
        {!!data.totals.length && <TableFooter><TableRow>{cells(data.totals)}</TableRow></TableFooter>}
      </Table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{first ? first + "–" + last + " of " + data.count + " rows" : "0 rows"}</span>
      {data.count > data.pageSize && <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Previous</Button>
        <span>Page {data.page}</span>
        <Button type="button" size="sm" variant="outline" disabled={last >= data.count} onClick={() => onPage(data.page + 1)}>Next</Button>
      </div>}
    </div>
  </section>;
}
