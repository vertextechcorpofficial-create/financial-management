"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { LoanMemberSelect } from "../../loans/LoanMemberSelect";
import { memberFetch } from "../../members/client";
import { copyCooperativeText } from "../../members/copyText";
import { isCalendarDate, todayManila } from "../../members/format";
import { statementPeriods } from "../../members/statement";
import type { StatementPeriod } from "../../members/types";
import type { getReportMemberChoices } from "../../server/member-reports";
import { channelLabels } from "../../transactions/entries";
import { CashEvidenceDialog } from "./CashEvidenceDialog";
import { monthPeriod } from "./report-dates";
import {
  FilterField, ReportBlocked, ReportErrorAlert, ReportEvidencePanel, ReportExportFeedback, ReportFacts, ReportFactsSkeleton,
  ReportFilterPanel, ReportHeader, ReportMemberEmpty, ReportNoticeAlert, ReportSelector, ReportTable, ReportTableSkeleton,
} from "./report-components";
import { reportHeroIcon } from "./report-ui";
import {
  reportLoanStatuses, reportRecordTypes, sectionPageParams, type CashEvidenceContext, type ReportKey, type ReportPage,
} from "./types";

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

function initialPeriod(report: ReportKey, periods: ReturnType<typeof statementPeriods>): StatementPeriod {
  if (report === "portfolio") return { from: "", to: "" };
  if (report === "savings" || report === "collections") return periods["Year to date"];
  if (report === "trial-balance") return periods["Last month"];
  if (report === "audit") return periods["This month"];
  return { from: periods["Last month"].from, to: periods["This month"].to };
}

function emptyMessageFor(report: ReportKey) {
  switch (report) {
    case "portfolio": return "No loans match these filters.";
    case "aging": return "No past-due installments in this period.";
    case "collections": return "No collections match these filters.";
    case "savings": return "No savings balances match these filters.";
    case "roster": return "No employees match these filters.";
    case "docs": return "No document gaps match these filters.";
    case "trial-balance": return "No accounts match this period.";
    case "month-end": return "No reconciliation rows for this month.";
    case "audit": return "No audit entries match these filters.";
    default: return "No rows match these filters.";
  }
}

export default function ReportsModule() {
  const [report, setReport] = useState<ReportKey>("soa");
  const HeroIcon = reportHeroIcon;
  return <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <section className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-emerald-500/5 blur-2xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <HeroIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cooperative</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reports</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Statements, loan portfolio, collections, compliance, and audit reports for the Cooperative.
            </p>
          </div>
        </div>
        <span className="w-fit rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">10 reports</span>
      </div>
    </section>

    <ReportSelector report={report} onSelect={setReport} />
    <ReportView key={report} report={report} />
  </main>;
}

function ReportMemberPicker({ member, onSelect }: { member?: Choices["members"][number]; onSelect: (value?: Choices["members"][number]) => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ q, page: String(page) });
  const choices = useReportRequest<Choices>(endpoint + "/members?" + params);
  return <LoanMemberSelect
    member={member} members={choices.data?.members ?? []} page={page} hasMore={choices.data?.hasMore ?? false}
    loading={choices.loading} error={choices.error} search={q} onSearchChange={value => { setQ(value); setPage(1); }}
    onPageChange={setPage} onRetry={choices.reload} onSelect={onSelect} emptyMessage="No memberships match this search."
  />;
}

function ReportView({ report }: { report: ReportKey }) {
  const statement = report === "soa";
  const portfolio = report === "portfolio";
  const collections = report === "collections";
  const trial = report === "trial-balance";
  const monthEnd = report === "month-end";
  const audit = report === "audit";
  const hasProduct = portfolio || collections || report === "aging";
  const hasPeriod = statement || report === "savings" || portfolio || collections || trial || audit;
  const periods = statementPeriods(todayManila());
  const lastMonth = periods["Last month"].to.slice(0, 7);
  const defaultPeriod = initialPeriod(report, periods);
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
  const [month, setMonth] = useState(lastMonth);
  const [editingEvidence, setEditingEvidence] = useState<CashEvidenceContext>();
  const [savedEvidence, setSavedEvidence] = useState("");
  const [period, setPeriod] = useState<StatementPeriod>(defaultPeriod);
  const [preset, setPreset] = useState("");
  const [working, setWorking] = useState<ExportFormat>();
  const [feedback, setFeedback] = useState<{ fingerprint: string; message: string; error?: boolean; stale?: boolean }>();
  const copyButton = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const abortExport = useRef<AbortController | null>(null);
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
  const periodChanged = hasPeriod && (period.from !== defaultPeriod.from || period.to !== defaultPeriod.to);
  const hasFilters = Boolean(q.trim() || department || status || product || channel || recordType || actorId || action
    || periodChanged || (monthEnd && month !== lastMonth));

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

  function resetFilters() {
    setQ("");
    setDepartment("");
    setStatus("");
    setProduct("");
    setChannel("");
    setRecordType("");
    setActorId("");
    setAction("");
    setPeriod(defaultPeriod);
    setPreset("");
    setMonth(lastMonth);
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

  function searchPlaceholder() {
    if (audit) return "Agreement, loan, journal, or record ID";
    if (hasProduct || report === "docs") return "Member or reference";
    if (report === "savings") return "Name or employee no.";
    return "Name, employee no. or agreement";
  }

  return <div ref={container} className="space-y-4">
    <ReportHeader report={report} data={data} loading={loading} exportReady={exportReady} working={working} stale={Boolean(message?.stale)}
      copyButtonRef={copyButton} onRefresh={refreshReport} onExport={format => void exportReport(format)} />
    {message && <ReportExportFeedback message={message} onRefresh={refreshReport} />}

    {data && !data.blocked ? <ReportFacts report={report} data={data} />
      : loading ? <ReportFactsSkeleton /> : null}

    <ReportFilterPanel count={data?.count} loading={loading} hasFilters={hasFilters} onClear={resetFilters}>
      {statement ? <>
        <FilterField label="Member" className="sm:col-span-2">
          <ReportMemberPicker member={member} onSelect={value => { setMember(value); resetPages(); }} />
        </FilterField>
        <FilterField label="Period">
          <NativeSelect className="h-9 w-full" value={preset} onChange={event => {
            const name = event.target.value as keyof typeof periods | "";
            changePeriod(name ? periods[name] : period, name);
          }}>
            <option value="">Custom</option>
            {Object.keys(periods).map(name => <option key={name}>{name}</option>)}
          </NativeSelect>
        </FilterField>
      </> : !trial && !monthEnd ? <>
        <FilterField label={audit ? "Record reference" : "Search"} className="sm:col-span-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-8" value={q} onChange={event => { setQ(event.target.value); resetPages(); }}
              placeholder={searchPlaceholder()} maxLength={120} />
          </div>
        </FilterField>
        {!audit && <FilterField label="Department">
          <NativeSelect className="h-9 w-full" value={department} onChange={event => {
            setDepartment(event.target.value); resetPages();
          }}>
            <option value="">All departments</option>
            {(previous?.departments ?? []).map(name => <option key={name}>{name}</option>)}
          </NativeSelect>
        </FilterField>}
        {audit && <>
          <FilterField label="Actor">
            <NativeSelect className="h-9 w-full" value={actorId} onChange={event => { setActorId(event.target.value); resetPages(); }}>
              <option value="">All actors</option>
              {(previous?.actors ?? []).map(actor => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
            </NativeSelect>
          </FilterField>
          <FilterField label="Action">
            <NativeSelect className="h-9 w-full" value={action} onChange={event => { setAction(event.target.value); resetPages(); }}>
              <option value="">All actions</option>
              {(previous?.actions ?? []).map(action => <option key={action.code} value={action.code}>{action.name}</option>)}
            </NativeSelect>
          </FilterField>
        </>}
        {(report === "savings" || report === "roster") && <FilterField label="Membership status">
          <NativeSelect className="h-9 w-full" value={status} onChange={event => { setStatus(event.target.value); resetPages(); }}>
            <option value="">All statuses</option>
            <option value="MEMBER">Member</option>
            {report === "roster" && <option value="NON_MEMBER">Not a member</option>}
            <option value="SEPARATED">Separated</option>
          </NativeSelect>
        </FilterField>}
        {hasProduct && <FilterField label="Product">
          <NativeSelect className="h-9 w-full" value={product} onChange={event => { setProduct(event.target.value); resetPages(); }}>
            <option value="">All products</option>
            {(previous?.products ?? []).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </NativeSelect>
        </FilterField>}
        {portfolio && <FilterField label="Loan status">
          <NativeSelect className="h-9 w-full" value={status} onChange={event => { setStatus(event.target.value); resetPages(); }}>
            <option value="">All statuses</option>
            {Object.entries(reportLoanStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </NativeSelect>
        </FilterField>}
        {collections && <FilterField label="Channel">
          <NativeSelect className="h-9 w-full" value={channel} onChange={event => { setChannel(event.target.value); resetPages(); }}>
            <option value="">All channels</option>
            {Object.entries(channelLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </NativeSelect>
        </FilterField>}
        {report === "docs" && <FilterField label="Record type">
          <NativeSelect className="h-9 w-full" value={recordType} onChange={event => { setRecordType(event.target.value); resetPages(); }}>
            <option value="">All records</option>
            {Object.entries(reportRecordTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </NativeSelect>
        </FilterField>}
      </> : null}

      {monthEnd && <FilterField label="Month">
        <Input className="h-9 w-full" type="month" value={month} max={lastMonth} onChange={event => {
          setMonth(event.target.value);
          setEditingEvidence(undefined);
          setSavedEvidence("");
          resetPages();
        }} />
      </FilterField>}

      {hasPeriod && <>
        <FilterField label={portfolio ? "Released from" : "From"}>
          <Input className="h-9 w-full" type="date" value={period.from} onChange={event => changePeriod({ ...period, from: event.target.value })} />
        </FilterField>
        <FilterField label={portfolio ? "Released to" : "To"}>
          <Input className="h-9 w-full" type="date" value={period.to} onChange={event => changePeriod({ ...period, to: event.target.value })} />
        </FilterField>
      </>}
    </ReportFilterPanel>

    {rangeError && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{rangeError}</p>}
    {statement && !member && !rangeError && <ReportMemberEmpty />}
    {error && <ReportErrorAlert error={error} onRetry={refreshReport} />}
    {loading && !data && !rangeError && !(statement && !member) && <ReportTableSkeleton title={statement ? "Savings" : undefined} />}

    {data?.blocked && <ReportBlocked notices={data.notices} onRetry={refreshReport} />}
    {data && !data.blocked && <>
      {data.notices?.map(notice => <ReportNoticeAlert key={notice.label} notice={notice} onRetry={refreshReport} />)}
      {monthEnd && !!data.cashEvidence?.length && <ReportEvidencePanel rows={data.cashEvidence} saved={savedEvidence}
        onEdit={evidence => { setSavedEvidence(""); setEditingEvidence(evidence); }} />}
      <ReportTable data={data} title={statement ? "Savings" : undefined} onPage={setPage}
        emptyMessage={statement ? "No savings activity in this period." : emptyMessageFor(report)} />
      {data.sections?.map(section => <ReportTable key={section.key} data={section} title={section.label}
        onPage={page => setDetailPages(current => ({ ...current, [section.key]: page }))}
        emptyMessage={section.key === "loans" ? "No loan balances or activity in this period." :
          section.key === "activity" ? "No loan activity in this period." : "No verified remittances in this period."} />)}
    </>}

    {editingEvidence && <CashEvidenceDialog evidence={editingEvidence}
      onClose={() => setEditingEvidence(undefined)}
      onSave={() => { setEditingEvidence(undefined); setSavedEvidence("Evidence saved."); refreshReport(); }}
      onRefresh={() => { setEditingEvidence(undefined); refreshReport(); }} />}
  </div>;
}
