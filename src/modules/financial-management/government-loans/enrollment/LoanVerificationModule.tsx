"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { ArrowDown, ArrowUp, BadgeCheck, CheckCircle2, ChevronsUpDown, Clock3, SearchX, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { EmptyState, MetricButton, MetricCard, MetricCardsSkeleton, PersonAvatar } from "../components/ui";
import { approvalAgencies, approvalDocumentUrl } from "../approval/api";
import { REQUEST_SLA_DAYS } from "../approval/rules";
import { RequestApiError } from "../requests/request-api";
import { RequestSection } from "../requests/RequestReview";
import { applicationPageSizes, requestStatusLabels } from "../requests/types";
import { EnrollmentActivationPanel } from "./EnrollmentActivationPanel";
import { EnrollmentDetails, EnrollmentEvidenceList } from "./EnrollmentDetails";
import { enrollmentBatchReference } from "./import-csv";
import { deductionMonthLabel } from "./rules";
import { enrollmentSorts, type EnrollmentSort } from "./types";
import { bulkVerify, decideVerification, getVerification, listVerification, payrollEvidenceUrl, verificationEvidenceUrl } from "./verification-api";
import { needsImportTransferChoice } from "./verification-rules";
import {
  verificationStatuses, type BulkVerificationResult, type EnrollmentDecision, type VerificationReview, type VerificationStatus,
} from "./verification-types";

function useRead<T>(load: ((signal: AbortSignal) => Promise<T>) | null, revision: number, delay = 0, retain = true) {
  const [state, setState] = useState<{ load: typeof load; revision: number; data?: T; error?: string }>();
  const [lastData, setLastData] = useState<T>();
  useEffect(() => {
    if (!load) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal).then(data => {
        if (!controller.signal.aborted) {
          setState({ load, revision, data });
          setLastData(data);
        }
      }).catch(cause => {
        if (!controller.signal.aborted) {
          setState({ load, revision, error: cause instanceof Error ? cause.message : "Try loading the enrollments again." });
        }
      });
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load, revision, delay]);
  if (!load) return undefined;
  const current = state?.load === load && state.revision === revision ? state : undefined;
  return {
    data: current?.data ?? (retain ? lastData : undefined),
    error: current?.error,
    pending: retain && Boolean(lastData) && !current?.data,
  };
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
    {message}<Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

function SummaryCard({ label, value, active, onClick, icon, tone, ringClass, detail }: {
  label: string; value: number; active: boolean; onClick: () => void;
  icon: ComponentType<{ className?: string }>; tone: "emerald" | "sky" | "amber" | "rose" | "slate";
  ringClass: string; detail: string;
}) {
  return <MetricButton active={active} onClick={onClick} label={label} ringClass={ringClass}>
    <MetricCard icon={icon} label={label} value={value} detail={detail} tone={tone} />
  </MetricButton>;
}

function SortHeader({ label, sortKey, sort, direction, align, onSort }: {
  label: string; sortKey: EnrollmentSort; sort: EnrollmentSort; direction: "asc" | "desc"; align?: "right";
  onSort: (key: EnrollmentSort) => void;
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

function Pager({ page, size, total, onPage, onSize }: {
  page: number; size: number; total: number; onPage: (page: number) => void; onSize: (size: number) => void;
}) {
  if (!total) return null;
  const start = (page - 1) * size + 1;
  const end = Math.min(page * size, total);
  return <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
    <p className="text-muted-foreground">Showing {start}–{end} of {total}</p>
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">Rows
        <NativeSelect aria-label="Verification rows per page" className="w-20" value={size}
          onChange={event => onSize(Number(event.target.value))}>
          {applicationPageSizes.map(value => <option key={value} value={value}>{value}</option>)}
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

function VerificationReviewPanel({ review, back, reload, saved }: {
  review: VerificationReview; back: () => void; reload: () => void; saved: (notice: string) => void;
}) {
  const { record, canDecide, checks, payrollWarnings } = review;
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<EnrollmentDecision | null>(null);
  const [confirmDecision, setConfirmDecision] = useState<EnrollmentDecision | null>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);

  function requestDecision(decision: EnrollmentDecision) {
    if (decision === "RETURN" && !reason.trim()) return;
    setConfirmDecision(decision);
  }

  async function decide(decision: EnrollmentDecision) {
    if (pending) return;
    const text = decision === "RETURN" ? reason.trim() : "";
    const payload = JSON.stringify([decision, text]);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: consignmentRequestId() };
    setPending(decision);
    try {
      const result = await decideVerification(record.id, record.request.revision, decision, text, attempt.current.key);
      saved(result.status === "ACTIVE" ? "Enrollment activated. Payroll instructions are ready to download." :
        result.status === "VERIFIED" ? "Enrollment verified. Finish activation from this review." : "Enrollment returned for correction.");
    } catch (cause) {
      const conflict = cause instanceof RequestApiError && cause.status === 409;
      toast.error(cause instanceof Error ? cause.message : "The decision could not be saved.",
        conflict ? { action: { label: "Reload review", onClick: reload } } : undefined);
    } finally {
      setPending(null);
    }
  }

  const { importTransfer } = record.enrollment;
  return <div className="space-y-4">
    <Button type="button" variant="ghost" disabled={Boolean(pending)} onClick={back}>Back to verification queue</Button>
    <EnrollmentDetails record={record} documentHref={kind => approvalDocumentUrl(record.id, kind)}
      payrollEvidenceHref={revision => payrollEvidenceUrl(record.id, revision)}>
      <EnrollmentActivationPanel review={review} onSaved={saved} reload={reload} />
      <EnrollmentEvidenceList record={record} href={kind => verificationEvidenceUrl(record.id, kind)}
        transferControl={importTransfer !== undefined && <p className="text-sm">Transferred from a previous employer · {importTransfer ? "Yes" : "No"}</p>} />
      {checks.length > 0 && <RequestSection title="Current verification checks">
        <ul className="divide-y text-sm">
          {checks.map(check => <li key={check.label} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
            <Badge variant={check.reason ? "destructive" : "outline"}>{check.reason ? "Needs review" : "Pass"}</Badge>
            <span className="font-medium">{check.label}</span>
            {check.reason && <span className="text-muted-foreground">{check.reason}</span>}
          </li>)}
        </ul>
        {payrollWarnings.length > 0 && <ul aria-label="Payroll warnings" className="list-disc pl-5 text-sm text-muted-foreground">
          {payrollWarnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>}
      </RequestSection>}
      {(canDecide || review.canReturnRenewal) && <RequestSection title="Decision">
        {canDecide && <p className="text-sm text-muted-foreground">Verification activates the loan and creates its Payroll instructions.</p>}
        <label className="block space-y-1.5 text-sm">
          <span className="block font-medium">Reason for return</span>
          <Textarea maxLength={500} disabled={Boolean(pending)} value={reason} onChange={event => setReason(event.target.value)} />
        </label>
        <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
          {canDecide && <Button type="button" disabled={Boolean(pending) || checks.some(check => check.reason)}
            onClick={() => requestDecision("VERIFY")}>{pending === "VERIFY" ? "Verifying…" : "Verify enrollment"}</Button>}
          <Button type="button" variant="outline" disabled={Boolean(pending) || !reason.trim()}
            onClick={() => requestDecision("RETURN")}>{pending === "RETURN" ? "Returning…" : "Return for correction"}</Button>
          <Button type="button" variant="ghost" disabled={Boolean(pending)} onClick={reload}>Reload review</Button>
        </div>
      </RequestSection>}
    </EnrollmentDetails>
    <AlertDialog open={confirmDecision !== null} onOpenChange={open => { if (!open && !pending) setConfirmDecision(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmDecision === "VERIFY" ? "Verify" : "Return"} {record.reference}?</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmDecision === "VERIFY"
              ? "Verification activates the loan and creates its Payroll instructions."
              : "The enrollment will return to the encoder for correction."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {reason.trim() && <p className="text-sm"><span className="font-medium">Reason:</span> {reason.trim()}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={Boolean(pending)}>Back to review</AlertDialogCancel>
          <Button type="button" disabled={Boolean(pending)} onClick={() => {
            if (!confirmDecision) return;
            const decision = confirmDecision;
            setConfirmDecision(null);
            void decide(decision);
          }}>Confirm {confirmDecision === "VERIFY" ? "verification" : "return"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

export function LoanVerificationModule() {
  const [search, setSearch] = useState("");
  const [agency, setAgency] = useState("");
  const [status, setStatus] = useState<VerificationStatus>("ENROLLED");
  const [batch, setBatch] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [sort, setSort] = useState<EnrollmentSort>("updated");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [openRecord, selectRecord] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [revision, refresh] = useState(0);
  const [agencyRevision, refreshAgencies] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [results, setResults] = useState<BulkVerificationResult | null>(null);
  const skipUrlWrite = useRef(true);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const batchId = /^(?:BT-)?0*([1-9]\d{0,9})$/i.exec(batch.trim())?.[1];
  const invalidBatch = Boolean(batch.trim() && !batchId);
  const query = new URLSearchParams({ q: search.trim(), page: String(page), status, sort, direction, size: String(size) });
  if (agency) query.set("agency", agency);
  if (batchId) query.set("batch", batchId);
  if (overdue) query.set("overdue", "1");
  const queryString = query.toString();
  const loadQueue = useCallback((signal: AbortSignal) => listVerification(queryString, signal), [queryString]);
  const loadReview = useCallback((signal: AbortSignal) => getVerification(openRecord!, signal), [openRecord]);
  const queue = useRead(openRecord === null && !invalidBatch ? loadQueue : null, revision, 180);
  const review = useRead(openRecord === null ? null : loadReview, revision, 0, false);
  const agencies = useRead(approvalAgencies, agencyRevision);
  const reload = () => refresh(value => value + 1);
  const items = queue?.data?.items ?? [];
  const selectable = items.filter(item => item.canDecide);
  const selections = selectable.filter(item => selected.includes(item.id)).map(item => ({ id: item.id, expectedRevision: item.revision }));
  const allSelected = selectable.length > 0 && selectable.every(item => selected.includes(item.id));
  const hasFilters = Boolean(search.trim() || agency || batch.trim() || overdue);

  useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const readStatus = params.get("ver_status");
      const readSort = params.get("ver_sort");
      const readDirection = params.get("ver_direction");
      const readSize = Number(params.get("ver_size"));
      setSearch(params.get("ver_q") ?? "");
      setAgency(params.get("ver_agency") ?? "");
      setBatch(params.get("ver_batch") ?? "");
      setOverdue(params.get("ver_overdue") === "1");
      setStatus(verificationStatuses.includes(readStatus as VerificationStatus) ? readStatus as VerificationStatus : "ENROLLED");
      setSort(readSort && readSort in enrollmentSorts ? readSort as EnrollmentSort : "updated");
      setDirection(readDirection === "desc" ? "desc" : "asc");
      setSize([10, 25, 50].includes(readSize) ? readSize : 25);
      setPage(Math.max(1, Number(params.get("ver_page")) || 1));
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
    setOrDelete("ver_q", search.trim());
    setOrDelete("ver_status", status !== "ENROLLED" ? status : "");
    setOrDelete("ver_agency", agency);
    setOrDelete("ver_batch", batch.trim());
    setOrDelete("ver_overdue", overdue ? "1" : "");
    setOrDelete("ver_sort", sort !== "updated" ? sort : "");
    setOrDelete("ver_direction", direction !== "asc" ? direction : "");
    setOrDelete("ver_size", size !== 25 ? String(size) : "");
    setOrDelete("ver_page", page > 1 ? String(page) : "");
    const next = params.toString();
    const target = window.location.pathname + (next ? "?" + next : "") + window.location.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (target !== current) window.history.replaceState(window.history.state, "", target);
  }, [agency, batch, direction, overdue, page, search, size, sort, status]);

  const filterChanged = () => { setPage(1); setSelected([]); setResults(null); };

  function changeFilter(update: () => void) {
    update();
    filterChanged();
  }

  function changeStatus(next: VerificationStatus) {
    setStatus(next);
    filterChanged();
  }

  function changeSort(next: EnrollmentSort) {
    if (next === sort) setDirection(value => value === "asc" ? "desc" : "asc");
    else { setSort(next); setDirection("asc"); }
    setPage(1);
    setSelected([]);
  }

  function changePage(next: number) {
    setPage(next);
    setSelected([]);
  }

  function changeSize(next: number) {
    setSize(next);
    setPage(1);
    setSelected([]);
  }

  function clearFilters() {
    setSearch("");
    setAgency("");
    setBatch("");
    setOverdue(false);
    filterChanged();
  }

  async function verifySelected() {
    if (working || !selections.length) return;
    const payload = JSON.stringify(selections);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: consignmentRequestId() };
    setWorking(true);
    try {
      const outcome = await bulkVerify(selections, attempt.current.key);
      setResults(outcome);
      toast.success(`${outcome.verified} verified · ${outcome.skipped} skipped`);
      attempt.current = null;
      setSelected([]);
      setConfirming(false);
      reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The batch could not be completed. Try again.");
    } finally {
      setWorking(false);
    }
  }

  const back = () => { selectRecord(null); setSelected([]); reload(); };
  if (openRecord !== null) return <div className="space-y-3">
    {review?.data ? <VerificationReviewPanel key={`${openRecord}:${revision}`} review={review.data} back={back} reload={reload}
      saved={message => { toast.success(message); reload(); }} /> : <>
      <Button type="button" variant="ghost" onClick={back}>Back to verification queue</Button>
      {review?.error ? <LoadError message={review.error} retry={reload} /> :
        <div className="space-y-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-36 w-full" /><Skeleton className="h-24 w-full" /></div>}
    </>}
  </div>;

  const summary = queue?.data?.summary;
  return <div className="space-y-4">
    <div>
      <h2 className="text-base font-semibold">Enrollment verification</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">Check each enrollment against the agency notice before deductions start.</p>
    </div>
    {summary ? <div className={cn("grid grid-cols-2 gap-2 xl:grid-cols-4", queue?.pending && "opacity-60")}>
      <SummaryCard label="For verification" value={summary.ENROLLED} active={status === "ENROLLED"} onClick={() => changeStatus("ENROLLED")}
        icon={ShieldCheck} tone="sky" ringClass="ring-sky-500/40" detail="Waiting for a second reviewer" />
      <SummaryCard label="Verified · awaiting activation" value={summary.VERIFIED} active={status === "VERIFIED"} onClick={() => changeStatus("VERIFIED")}
        icon={BadgeCheck} tone="emerald" ringClass="ring-emerald-500/40" detail="Ready to activate" />
      <SummaryCard label="Activation pending" value={summary.ACTIVATING} active={status === "ACTIVATING"} onClick={() => changeStatus("ACTIVATING")}
        icon={Clock3} tone="amber" ringClass="ring-amber-500/40" detail="Payroll instructions in progress" />
      <SummaryCard label="Active" value={summary.ACTIVE} active={status === "ACTIVE"} onClick={() => changeStatus("ACTIVE")}
        icon={CheckCircle2} tone="emerald" ringClass="ring-emerald-500/40" detail="Deducted through Payroll" />
    </div> : queue?.error ? null : <MetricCardsSkeleton />}
    <div className="flex flex-wrap gap-2">
      <Input className="max-w-sm" aria-label="Search verification queue" placeholder="Employee, loan, encoder, or agency reference" maxLength={120}
        value={search} onChange={event => changeFilter(() => setSearch(event.target.value))} />
      <NativeSelect aria-label="Filter verification by status" value={status}
        onChange={event => changeStatus(event.target.value as VerificationStatus)}>
        {verificationStatuses.map(item => <option value={item} key={item}>{requestStatusLabels[item]}</option>)}
      </NativeSelect>
      <NativeSelect aria-label="Filter verification by agency" value={agency} onChange={event => changeFilter(() => setAgency(event.target.value))}>
        <option value="">All agencies</option>
        {agencies?.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>
      <Input className="max-w-48" aria-label="Filter verification by import batch" placeholder="Import batch reference" maxLength={22}
        aria-invalid={invalidBatch} value={batch} onChange={event => changeFilter(() => setBatch(event.target.value))} />
      <label className="flex items-center gap-2 self-center text-sm">
        <Checkbox checked={overdue} onCheckedChange={value => changeFilter(() => setOverdue(value === true))} /> Overdue only
      </label>
      {hasFilters && <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
      <Button type="button" variant="outline" onClick={() => { setSelected([]); reload(); }} disabled={queue?.pending}>Refresh queue</Button>
    </div>
    {status === "ENROLLED" && selections.length > 0 && <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 text-sm shadow-sm backdrop-blur">
      <span>{selections.length} selected</span>
      <Button type="button" variant="outline" size="sm" onClick={() => setSelected([])}>Clear selection</Button>
      <Button type="button" size="sm" onClick={() => setConfirming(true)}>Verify selected</Button>
    </div>}
    {agencies?.error && <LoadError message={agencies.error} retry={() => refreshAgencies(value => value + 1)} />}
    {invalidBatch && <p role="status" className="text-sm text-muted-foreground">Enter a batch number or its reference, such as BT-0001.</p>}
    {queue?.error && <LoadError message={queue.error} retry={reload} />}
    {!queue?.data && !queue?.error && !invalidBatch && <div className="space-y-2 rounded-lg border p-3"><Skeleton className="h-9 w-full" />{[0, 1, 2, 3, 4].map(value => <Skeleton key={value} className="h-12 w-full" />)}</div>}
    {results && <RequestSection title="Bulk verification results">
      <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
        <span>{results.verified} verified · {results.skipped} skipped</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setResults(null)}>Dismiss results</Button>
      </div>
      <ul className="divide-y text-sm">
        {results.items.map(item => <li key={item.id} className="flex flex-wrap items-center gap-2 py-1">
          <Button type="button" variant="link" className="px-0" size="sm" onClick={() => selectRecord(item.id)}>{item.reference}</Button>
          <Badge variant="outline">{item.outcome === "verified" ? "Verified" : "Skipped"}</Badge>
          {item.reason && <span>{item.reason}</span>}
        </li>)}
      </ul>
    </RequestSection>}
    {queue?.data && <>
      <p className="text-sm text-muted-foreground">{queue.data.openMonth ? "Open month " + deductionMonthLabel(queue.data.openMonth) : "Open month unavailable"}</p>
      <div className={cn("hidden overflow-x-auto rounded-lg border md:block", queue.pending && "opacity-60")}>
        <Table>
          <caption className="sr-only">Enrollment verification queue</caption>
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card"><TableRow>
            {status === "ENROLLED" && <TableHead className="w-10"><Checkbox aria-label="Select eligible enrollments on this page"
              disabled={!selectable.length} checked={selected.length > 0 && (allSelected ? true : "indeterminate")}
              onCheckedChange={value => setSelected(value === true ? selectable.map(item => item.id) : [])} /></TableHead>}
            <SortHeader label="Loan" sortKey="reference" sort={sort} direction={direction} onSort={changeSort} />
            <SortHeader label="Employee" sortKey="employee" sort={sort} direction={direction} onSort={changeSort} />
            <SortHeader label="Agency / program" sortKey="agency" sort={sort} direction={direction} onSort={changeSort} />
            <SortHeader label="Amortization" sortKey="amortization" sort={sort} direction={direction} align="right" onSort={changeSort} />
            <SortHeader label="First deduction" sortKey="starts" sort={sort} direction={direction} onSort={changeSort} />
            <TableHead>Waiting</TableHead>
            <SortHeader label="Prepared by" sortKey="updated" sort={sort} direction={direction} onSort={changeSort} />
            <TableHead>Evidence</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!items.length && <TableRow><TableCell colSpan={status === "ENROLLED" ? 9 : 8} className="p-0">
              <EmptyState icon={SearchX}
                title={hasFilters ? "No enrollments match these filters" : "No enrollments waiting for verification"}
                description={hasFilters ? "Try a different search or clear the filters." : "Enrollments appear here after they are saved."}
                action={hasFilters ? <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined} />
            </TableCell></TableRow>}
            {items.map(item => <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => selectRecord(item.id)}>
              {status === "ENROLLED" && <TableCell onClick={event => event.stopPropagation()}><Checkbox aria-label={`Select ${item.reference}`} checked={selected.includes(item.id)} disabled={!item.canDecide}
                onCheckedChange={checked => setSelected(ids => checked === true ? [...ids, item.id] : ids.filter(id => id !== item.id))} /></TableCell>}
              <TableCell>
                <Button type="button" variant="link" size="sm" className="px-0" onClick={event => { event.stopPropagation(); selectRecord(item.id); }}>{item.reference}</Button>
                <span className="block max-w-56 truncate text-xs text-muted-foreground" title={item.enrollment.agencyReference}>{item.enrollment.agencyReference}</span>
                {item.importBatchId && <span className="block text-xs text-muted-foreground">{enrollmentBatchReference(item.importBatchId)}</span>}
              </TableCell>
              <TableCell>
                <div className="flex min-w-0 items-center gap-2.5">
                  <PersonAvatar name={item.employeeName ?? "Employee"} size="sm" />
                  <span className="truncate font-medium">{item.employeeName ?? "—"}</span>
                </div>
              </TableCell>
              <TableCell>{item.agencyName ?? "—"}<span className="block text-xs text-muted-foreground">{item.program}</span></TableCell>
              <TableCell className="text-right tabular-nums">{peso(item.enrollment.monthlyAmortization)}</TableCell>
              <TableCell>{deductionMonthLabel(item.enrollment.firstDeductionMonth)}</TableCell>
              <TableCell><WaitingBadge days={item.waitingDays} /></TableCell>
              <TableCell>
                {item.enrollment.resubmittedBy?.name ?? item.enrollment.encodedBy.name}
                <span className="block text-xs text-muted-foreground">{dateTime(item.enrollment.resubmittedAt ?? item.enrollment.encodedAt)} PHT</span>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{item.documentsPresent} / {item.documentsRequired} documents</Badge>
                {needsImportTransferChoice(item.enrollment) && <span className="block text-xs text-muted-foreground">Transfer status required</span>}
                {item.enrollment.externalReferenceCheck === "NEEDS_SOURCE" && <span className="block text-xs text-muted-foreground">Payroll mapping pending</span>}
                {Boolean(item.enrollment.payrollWarnings?.length) && <span className="block text-xs text-muted-foreground">Payroll warnings</span>}
              </TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
      <div className={cn("space-y-2 md:hidden", queue.pending && "opacity-60")}>{items.map(item => <article key={item.id} className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Button type="button" size="sm" variant="link" className="h-auto px-0 font-medium" onClick={() => selectRecord(item.id)}>{item.reference}</Button>
            <p className="break-words">{item.employeeName ?? "—"} · {item.program}</p>
            <p className="text-xs text-muted-foreground">{item.agencyName ?? "—"} · {item.enrollment.agencyReference}</p>
          </div>
          {status === "ENROLLED" && <Checkbox aria-label={`Select ${item.reference}`} checked={selected.includes(item.id)} disabled={!item.canDecide}
            onCheckedChange={checked => setSelected(ids => checked === true ? [...ids, item.id] : ids.filter(id => id !== item.id))} />}
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <div><dt className="text-xs text-muted-foreground">Amortization</dt><dd className="tabular-nums">{peso(item.enrollment.monthlyAmortization)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">First deduction</dt><dd>{deductionMonthLabel(item.enrollment.firstDeductionMonth)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Waiting</dt><dd><WaitingBadge days={item.waitingDays} /></dd></div>
          <div><dt className="text-xs text-muted-foreground">Evidence</dt><dd>{item.documentsPresent} / {item.documentsRequired} documents</dd></div>
        </dl>
        <p className="text-xs text-muted-foreground">{item.enrollment.resubmittedBy?.name ?? item.enrollment.encodedBy.name} · {dateTime(item.enrollment.resubmittedAt ?? item.enrollment.encodedAt)} PHT</p>
        <div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => selectRecord(item.id)}>Review</Button></div>
      </article>)}</div>
      <Pager page={page} size={size} total={queue.data.total} onPage={changePage} onSize={changeSize} />
    </>}
    <AlertDialog open={confirming} onOpenChange={value => { if (!working) setConfirming(value); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Verify selected enrollments?</AlertDialogTitle>
          <AlertDialogDescription>{selections.length} selected. Passing enrollments become active and receive Payroll instructions. Each skip includes its reason.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
          <Button type="button" disabled={working || !selections.length} onClick={() => void verifySelected()}>{working ? "Verifying…" : "Verify enrollments"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
