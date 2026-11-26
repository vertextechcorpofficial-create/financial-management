"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronsUpDown, Clock3, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { EmptyState, MetricButton, MetricCard, MetricCardsSkeleton, PersonAvatar } from "../components/ui";
import { ApprovalReviewPanel } from "./ApprovalReviewPanel";
import { BulkApprovalDialog } from "./BulkApprovalDialog";
import { approvalAgencies, approvalDecisions, approvalQueue, approvalReview } from "./api";
import { REQUEST_SLA_DAYS } from "./rules";
import {
  approvalPageSizes, approvalSorts, type ApprovalDecisionRow, type ApprovalQueueItem, type ApprovalSort, type BulkApprovalResult,
} from "./types";

type Loader<T> = (signal: AbortSignal) => Promise<T>;
type Direction = "asc" | "desc";
type ChecksFilter = "" | "ready" | "review";

function useApprovalRead<T>(load: Loader<T> | null, refresh: number, delay = 0, retain = true) {
  const [state, setState] = useState<{ load: Loader<T>; refresh: number; data?: T; error?: string }>();
  const [lastData, setLastData] = useState<T>();
  useEffect(() => {
    if (!load) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal).then(data => {
        if (!controller.signal.aborted) {
          setState({ load, refresh, data });
          setLastData(data);
        }
      }).catch(error => {
        if (!controller.signal.aborted) {
          setState({ load, refresh, error: error instanceof Error ? error.message : "Try loading the requests again." });
        }
      });
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load, refresh, delay]);
  if (!load) return undefined;
  const current = state?.load === load && state.refresh === refresh ? state : undefined;
  return {
    data: current?.data ?? (retain ? lastData : undefined),
    error: current?.error,
    pending: retain && Boolean(lastData) && !current?.data,
  };
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
    {message} <Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

function SummaryCard({ label, value, detail, active, icon, tone, ringClass, onClick }: {
  label: string; value: number; detail?: string; active: boolean;
  icon: ComponentType<{ className?: string }>; tone: "emerald" | "sky" | "amber" | "rose"; ringClass: string; onClick: () => void;
}) {
  return <MetricButton active={active} onClick={onClick} label={label} ringClass={ringClass}>
    <MetricCard icon={icon} label={label} value={value} detail={detail} tone={tone} alert={tone === "rose" && value > 0} />
  </MetricButton>;
}

function SortHeader({ label, sortKey, sort, direction, align, onSort }: {
  label: string; sortKey: ApprovalSort; sort: ApprovalSort; direction: Direction; align?: "right";
  onSort: (key: ApprovalSort) => void;
}) {
  const active = sortKey === sort;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return <TableHead aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
    className={align === "right" ? "text-right" : undefined}>
    <button type="button" onClick={() => onSort(sortKey)}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap", align === "right" && "justify-end", active && "text-foreground")}>
      {label}<Icon className="size-3.5 opacity-60" />
    </button>
  </TableHead>;
}

function Pager({ label, page, size, total, onPage, onSize }: {
  label: string; page: number; size: number; total: number; onPage: (page: number) => void; onSize: (size: number) => void;
}) {
  if (!total) return null;
  const start = (page - 1) * size + 1;
  const end = Math.min(page * size, total);
  return <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
    <p className="text-muted-foreground">Showing {start}–{end} of {total}</p>
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">Rows
        <NativeSelect aria-label={`${label} rows per page`} className="w-20" value={size}
          onChange={event => onSize(Number(event.target.value))}>
          {approvalPageSizes.map(value => <option key={value} value={value}>{value}</option>)}
        </NativeSelect>
      </label>
      <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button type="button" variant="outline" size="sm" disabled={end >= total} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  </div>;
}

function WaitingBadge({ days }: { days: number }) {
  const label = `${days} ${days === 1 ? "day" : "days"}`;
  if (days > REQUEST_SLA_DAYS) return <Badge variant="destructive">{label} · Overdue</Badge>;
  if (days === REQUEST_SLA_DAYS) return <Badge variant="outline" className="text-amber-700 dark:text-amber-400">{label} · SLA due</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

function agencyTone(name: string | null) {
  const value = (name ?? "").toLowerCase();
  if (value.includes("pag-ibig") || value.includes("hdmf")) return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300";
  if (value.includes("sss") || value.includes("social security")) return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300";
  if (value.includes("bank")) return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";
  return "text-muted-foreground";
}

function AgencyBadge({ name }: { name: string | null }) {
  return <Badge variant="outline" className={agencyTone(name)}>{name ?? "—"}</Badge>;
}

function failedChecks(row: ApprovalQueueItem) {
  return (row.checks ?? []).filter(check => check.result === "review");
}

function ChecksBadge({ row }: { row: ApprovalQueueItem }) {
  const failed = failedChecks(row);
  const failedText = failed.map(check => check.label + (check.detail ? ": " + check.detail : "")).join("\n");
  return <>
    <Badge variant="outline" title={failedText} className={row.filedChecksPass ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
      {row.filedChecksPass ? "OK" : failed.length ? failed.length + " review" : "Review"}
    </Badge>
    {failed.length > 0 && <p className="max-w-48 truncate text-xs text-muted-foreground" title={failedText}>{failed.map(check => check.label).join(", ")}</p>}
  </>;
}

function DecisionsTable({ rows, onReview }: { rows: ApprovalDecisionRow[]; onReview: (id: number) => void }) {
  if (!rows.length) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">No decisions recorded.</p>;
  return <>
    <div className="hidden overflow-hidden rounded-lg border md:block">
      <Table>
        <caption className="sr-only">Recent approval decisions</caption>
        <TableHeader><TableRow>
          <TableHead>Request</TableHead><TableHead>Employee</TableHead><TableHead>Agency</TableHead>
          <TableHead>Decision</TableHead><TableHead>Decided by</TableHead><TableHead>Decided at</TableHead><TableHead>Remarks</TableHead>
        </TableRow></TableHeader>
        <TableBody>{rows.map(item => <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onReview(item.requestId)}>
          <TableCell><Button type="button" size="sm" variant="link" className="px-0" onClick={event => { event.stopPropagation(); onReview(item.requestId); }}>{item.reference}</Button></TableCell>
          <TableCell>{item.employeeName ?? "—"}</TableCell><TableCell><AgencyBadge name={item.agencyName} /></TableCell>
          <TableCell><Badge variant="outline" className={item.decision === "APPROVED"
            ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
            : "border-destructive/30 bg-destructive/10 text-destructive"}>
            {item.decision === "APPROVED" ? "Approved" : "Rejected"}</Badge></TableCell>
          <TableCell>{item.actorName}</TableCell>
          <TableCell><time dateTime={item.occurredAt}>{dateTime(item.occurredAt)} PHT</time></TableCell>
          <TableCell className="min-w-36 max-w-72 whitespace-pre-wrap break-words">{item.remarks ?? "—"}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
    <div className="space-y-2 md:hidden">{rows.map(item => <article key={item.id} className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Button type="button" size="sm" variant="link" className="h-auto px-0 font-medium" onClick={() => onReview(item.requestId)}>{item.reference}</Button>
        <Badge variant="outline" className={item.decision === "APPROVED"
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "border-destructive/30 bg-destructive/10 text-destructive"}>
          {item.decision === "APPROVED" ? "Approved" : "Rejected"}</Badge>
      </div>
      <p>{item.employeeName ?? "—"} · <AgencyBadge name={item.agencyName} /></p>
      <p className="text-xs text-muted-foreground">{item.actorName} · {dateTime(item.occurredAt)} PHT</p>
      {item.remarks && <p className="whitespace-pre-wrap break-words text-xs">{item.remarks}</p>}
    </article>)}</div>
  </>;
}

export function LoanApprovalModule() {
  const [search, setSearch] = useState("");
  const [agency, setAgency] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [checks, setChecks] = useState<ChecksFilter>("");
  const [sort, setSort] = useState<ApprovalSort>("filed");
  const [direction, setDirection] = useState<Direction>("asc");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySize, setHistorySize] = useState(10);
  const [refresh, setRefresh] = useState(0);
  const [reviewRefresh, setReviewRefresh] = useState(0);
  const [agencyRefresh, setAgencyRefresh] = useState(0);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmRows, setConfirmRows] = useState<ApprovalQueueItem[] | null>(null);
  const [batchResult, setBatchResult] = useState<BulkApprovalResult | null>(null);
  const [notice, setNotice] = useState("");
  const skipUrlWrite = useRef(true);

  const query = new URLSearchParams({ page: String(page), sort, direction, size: String(size) });
  if (search.trim()) query.set("q", search.trim());
  if (agency) query.set("agency", agency);
  if (overdue) query.set("overdue", "1");
  if (checks) query.set("checks", checks);
  const queryString = query.toString();
  const historyQuery = new URLSearchParams({ page: String(historyPage), size: String(historySize) }).toString();
  const loadQueue = useCallback((signal: AbortSignal) => approvalQueue(queryString, signal), [queryString]);
  const loadHistory = useCallback((signal: AbortSignal) => approvalDecisions(historyQuery, signal), [historyQuery]);
  const loadReview = useCallback((signal: AbortSignal) => approvalReview(reviewId!, signal), [reviewId]);
  const queue = useApprovalRead(loadQueue, refresh, 160);
  const history = useApprovalRead(loadHistory, refresh);
  const agencies = useApprovalRead(approvalAgencies, agencyRefresh);
  const detail = useApprovalRead(reviewId === null ? null : loadReview, reviewRefresh, 0, false);
  const items = queue?.data?.items ?? [];
  const eligible = items.filter(row => row.filedChecksPass);
  const selectedRows = eligible.filter(row => selected.includes(row.id));
  const hasFilters = Boolean(search.trim() || agency || overdue || checks);

  useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const readSort = params.get("lap_sort");
      const readDirection = params.get("lap_direction");
      const readSize = Number(params.get("lap_size"));
      const readChecks = params.get("lap_checks");
      setSearch(params.get("lap_q") ?? "");
      setAgency(params.get("lap_agency") ?? "");
      setOverdue(params.get("lap_overdue") === "1");
      setChecks(readChecks === "ready" || readChecks === "review" ? readChecks : "");
      setSort(readSort && readSort in approvalSorts ? readSort as ApprovalSort : "filed");
      setDirection(readDirection === "desc" ? "desc" : "asc");
      setSize([10, 25, 50].includes(readSize) ? readSize : 25);
      setPage(Math.max(1, Number(params.get("lap_page")) || 1));
    };
    syncFromLocation();
    skipUrlWrite.current = true;
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    if (skipUrlWrite.current) { skipUrlWrite.current = false; return; }
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string) => value ? params.set(key, value) : params.delete(key);
    setOrDelete("lap_q", search.trim());
    setOrDelete("lap_agency", agency);
    setOrDelete("lap_overdue", overdue ? "1" : "");
    setOrDelete("lap_checks", checks);
    setOrDelete("lap_sort", sort !== "filed" ? sort : "");
    setOrDelete("lap_direction", direction !== "asc" ? direction : "");
    setOrDelete("lap_size", size !== 25 ? String(size) : "");
    setOrDelete("lap_page", page > 1 ? String(page) : "");
    const next = params.toString();
    const target = window.location.pathname + (next ? "?" + next : "") + window.location.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (target !== current) window.history.replaceState(window.history.state, "", target);
  }, [agency, checks, direction, overdue, page, search, size, sort]);

  function changePage(next: number) {
    setPage(next);
    setSelected([]);
  }

  function changeSize(next: number) {
    setSize(next);
    setPage(1);
    setSelected([]);
  }

  function changeSort(next: ApprovalSort) {
    if (next === sort) setDirection(value => value === "asc" ? "desc" : "asc");
    else { setSort(next); setDirection("asc"); }
    setPage(1);
    setSelected([]);
  }

  function changeFilter(update: () => void) {
    update();
    setPage(1);
    setSelected([]);
  }

  function clearFilters() {
    setSearch("");
    setAgency("");
    setOverdue(false);
    setChecks("");
    setPage(1);
    setSelected([]);
  }

  function showAllQueue() {
    setOverdue(false);
    setChecks("");
    setPage(1);
    setSelected([]);
  }

  function toggleChecks(next: Exclude<ChecksFilter, "">) {
    changeFilter(() => setChecks(value => value === next ? "" : next));
  }

  function refreshLists() {
    setPage(1);
    setHistoryPage(1);
    setSelected([]);
    setRefresh(value => value + 1);
  }

  if (reviewId !== null) {
    if (detail?.data) return <ApprovalReviewPanel key={`${reviewId}:${reviewRefresh}`} review={detail.data}
      onBack={() => setReviewId(null)} onReload={() => setReviewRefresh(value => value + 1)} onDecision={message => {
        setReviewId(null);
        setBatchResult(null);
        setNotice(message);
        refreshLists();
      }} />;
    return <div className="space-y-3">
      <Button type="button" variant="ghost" onClick={() => setReviewId(null)}>Back to approvals</Button>
      {detail?.error ? <LoadError message={detail.error} retry={() => setReviewRefresh(value => value + 1)} /> :
        <div className="space-y-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-36 w-full" /><Skeleton className="h-24 w-full" /></div>}
    </div>;
  }

  const summary = queue?.data?.summary;
  const oldest = summary?.oldestWaitingDays ?? 0;

  return <div className="min-w-0 space-y-6">
    {confirmRows && <BulkApprovalDialog rows={confirmRows} onClose={() => setConfirmRows(null)} onComplete={result => {
      setConfirmRows(null);
      setBatchResult(result);
      setNotice("");
      refreshLists();
    }} />}
    {notice && <p role="status" className="rounded-lg border p-3 text-sm">{notice}</p>}
    {batchResult && <section aria-label="Bulk approval results" className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="font-medium">{batchResult.approved} approved · {batchResult.skipped} skipped</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => setBatchResult(null)}>Dismiss results</Button>
      </div>
      {batchResult.skipped > 0 && <ul className="space-y-1">{batchResult.items.filter(item => item.outcome === "skipped")
        .map(item => <li key={item.id} className="break-words"><span className="font-medium">{item.reference}</span> · {item.reason}</li>)}</ul>}
    </section>}
    <section aria-label="Waiting for approval" className="space-y-3">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Waiting for approval</h2>
          <Button type="button" variant="outline" size="sm" onClick={refreshLists} disabled={queue?.pending}>Refresh queue</Button>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Approve or reject each employee&apos;s loan request. Approving means the company supports the application and HR completes the employer certification; the agency still makes the final loan decision.
        </p>
      </div>
      {summary ? <div className={cn("grid grid-cols-2 gap-2 xl:grid-cols-4", queue?.pending && "opacity-60")}>
        <SummaryCard label="Waiting" value={summary.waiting}
          detail={summary.waiting ? `Oldest ${oldest} ${oldest === 1 ? "day" : "days"}` : "No requests waiting"}
          icon={Clock3} tone="sky" ringClass="ring-sky-500/40" active={!checks && !overdue} onClick={showAllQueue} />
        <SummaryCard label="Ready to approve" value={summary.ready} icon={CheckCircle2} tone="emerald" ringClass="ring-emerald-500/40"
          active={checks === "ready"} onClick={() => toggleChecks("ready")} />
        <SummaryCard label="Needs review" value={summary.review} icon={AlertTriangle} tone="amber" ringClass="ring-amber-500/40"
          active={checks === "review"} onClick={() => toggleChecks("review")} />
        <SummaryCard label="Overdue" value={summary.overdue} icon={AlertTriangle} tone="rose" ringClass="ring-rose-500/40" active={overdue}
          onClick={() => changeFilter(() => setOverdue(value => !value))} />
      </div> : queue?.error ? null : <MetricCardsSkeleton />}
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Search requests" placeholder="Employee or request no." className="max-w-xs" value={search} maxLength={120}
          onChange={event => changeFilter(() => setSearch(event.target.value))} />
        <NativeSelect aria-label="Filter by agency" value={agency} disabled={!agencies?.data}
          onChange={event => changeFilter(() => setAgency(event.target.value))}>
          <option value="">All agencies</option>
          {agencies?.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Filter by filed checks" value={checks}
          onChange={event => changeFilter(() => setChecks(event.target.value as ChecksFilter))}>
          <option value="">All checks</option><option value="ready">Ready to approve</option><option value="review">Needs review</option>
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={overdue} onCheckedChange={value => changeFilter(() => setOverdue(value === true))} /> Overdue only
        </label>
        {hasFilters && <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
      </div>
      {agencies?.error && <LoadError message={agencies.error} retry={() => setAgencyRefresh(value => value + 1)} />}
      {!!selectedRows.length && <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-background/95 p-2 text-sm shadow-sm backdrop-blur">
        <span>{selectedRows.length} selected</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setSelected([])}>Clear selection</Button>
        <Button type="button" size="sm" onClick={() => setConfirmRows(selectedRows)}>Approve selected</Button>
      </div>}
      {queue?.error && <LoadError message={queue.error} retry={refreshLists} />}
      {!queue && <div className="space-y-2 rounded-lg border p-3"><Skeleton className="h-9 w-full" />{[0, 1, 2, 3, 4].map(value => <Skeleton key={value} className="h-12 w-full" />)}</div>}
      {queue?.data && <>
        <div className={cn("hidden overflow-x-auto rounded-lg border md:block", queue.pending && "opacity-60")}>
          <Table>
            <caption className="sr-only">Loan requests waiting for company approval</caption>
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card"><TableRow>
              <TableHead className="w-10"><Checkbox aria-label="Select eligible requests on this page" disabled={!eligible.length}
                checked={selectedRows.length > 0 && (selectedRows.length === eligible.length ? true : "indeterminate")}
                onCheckedChange={value => setSelected(value === true ? eligible.map(row => row.id) : [])} /></TableHead>
              <SortHeader label="Request" sortKey="reference" sort={sort} direction={direction} onSort={changeSort} />
              <SortHeader label="Employee" sortKey="employee" sort={sort} direction={direction} onSort={changeSort} />
              <SortHeader label="Agency" sortKey="agency" sort={sort} direction={direction} onSort={changeSort} />
              <SortHeader label="Program" sortKey="program" sort={sort} direction={direction} onSort={changeSort} />
              <SortHeader label="Amount" sortKey="amount" sort={sort} direction={direction} align="right" onSort={changeSort} />
              <SortHeader label="Filed" sortKey="filed" sort={sort} direction={direction} onSort={changeSort} />
              <SortHeader label="Checks" sortKey="checks" sort={sort} direction={direction} onSort={changeSort} />
              <SortHeader label="Waiting" sortKey="waiting" sort={sort} direction={direction} onSort={changeSort} />
              <TableHead>Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!items.length && <TableRow><TableCell colSpan={10} className="p-0">
                <EmptyState icon={SearchX}
                  title={hasFilters ? "No requests match these filters" : "No requests waiting for approval"}
                  description={hasFilters ? "Try a different search or clear the filters." : "New requests appear here after they are filed."}
                  action={hasFilters ? <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined} />
              </TableCell></TableRow>}
              {items.map(row => <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setReviewId(row.id)}>
                <TableCell onClick={event => event.stopPropagation()} title={!row.filedChecksPass ? "Checks must be reviewed before selection." : undefined}>
                  <Checkbox aria-label={`Select ${row.reference}`} disabled={!row.filedChecksPass} checked={selected.includes(row.id)}
                    onCheckedChange={value => setSelected(ids => value === true ? [...ids, row.id] : ids.filter(id => id !== row.id))} /></TableCell>
                <TableCell><Button type="button" size="sm" variant="link" className="px-0" onClick={event => { event.stopPropagation(); setReviewId(row.id); }}>{row.reference}</Button></TableCell>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <PersonAvatar name={row.employeeName ?? "Employee"} size="sm" />
                    <span className="truncate font-medium">{row.employeeName ?? "—"}</span>
                  </div>
                </TableCell><TableCell><AgencyBadge name={row.agencyName} /></TableCell><TableCell>{row.program}</TableCell>
                <TableCell className="text-right tabular-nums">{peso(row.amount)}</TableCell>
                <TableCell><time dateTime={row.requestedAt}>{dateTime(row.requestedAt)} PHT</time>
                  {row.filedBy && <span className="block text-xs text-muted-foreground">{row.filedBy}</span>}</TableCell>
                <TableCell><ChecksBadge row={row} /></TableCell>
                <TableCell><WaitingBadge days={row.waitingDays} /></TableCell>
                <TableCell><Button type="button" variant="outline" size="sm" onClick={event => { event.stopPropagation(); setReviewId(row.id); }}>Review</Button></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
        <div className={cn("space-y-2 md:hidden", queue.pending && "opacity-60")}>{items.map(row => <article key={row.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Button type="button" size="sm" variant="link" className="h-auto px-0 font-medium" onClick={() => setReviewId(row.id)}>{row.reference}</Button>
              <p className="break-words">{row.employeeName ?? "—"} · {row.program}</p>
              <p className="mt-1"><AgencyBadge name={row.agencyName} /></p>
            </div>
            <Checkbox aria-label={`Select ${row.reference}`} disabled={!row.filedChecksPass} checked={selected.includes(row.id)}
              onCheckedChange={value => setSelected(ids => value === true ? [...ids, row.id] : ids.filter(id => id !== row.id))} />
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <div><dt className="text-xs text-muted-foreground">Amount</dt><dd className="tabular-nums">{peso(row.amount)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Waiting</dt><dd><WaitingBadge days={row.waitingDays} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Filed</dt><dd>{dateTime(row.requestedAt)} PHT{row.filedBy && <span className="block text-xs text-muted-foreground">{row.filedBy}</span>}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Checks</dt><dd><ChecksBadge row={row} /></dd></div>
          </dl>
          <div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => setReviewId(row.id)}>Review</Button></div>
        </article>)}</div>
        <Pager label="Approval queue" page={page} size={size} total={queue.data.total}
          onPage={changePage} onSize={changeSize} />
      </>}
    </section>
    <section aria-label="Recent decisions" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Recent decisions</h2>
          <p className="text-sm text-muted-foreground">Approved and rejected requests, newest first.</p>
        </div>
      </div>
      {history?.error && <LoadError message={history.error} retry={() => setRefresh(value => value + 1)} />}
      {!history && <div className="space-y-2 rounded-lg border p-3">{[0, 1, 2].map(value => <Skeleton key={value} className="h-10 w-full" />)}</div>}
      {history?.data && <>
        <DecisionsTable rows={history.data.items} onReview={setReviewId} />
        <Pager label="Decision history" page={historyPage} size={historySize} total={history.data.total}
          onPage={value => { setHistoryPage(value); }} onSize={value => { setHistorySize(value); setHistoryPage(1); }} />
      </>}
    </section>
  </div>;
}
