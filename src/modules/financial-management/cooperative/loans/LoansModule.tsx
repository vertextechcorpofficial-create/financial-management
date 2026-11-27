"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, FileText,
  FolderClosed, HandCoins, LayoutDashboard, Plus, Receipt, Search, SearchX, ShieldCheck, TrendingUp, Wallet, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ConsoleDialog, EmptyState, Kv, Panel, Progress, StatusChip,
} from "../console/components/ui";
import { MetricCard, PersonAvatar } from "../members/components";
import { peso } from "../members/format";
import { CooperativeDocuments } from "../members/MemberDocuments";
import type { LoanEnrollmentResult } from "../server/loan-enrollment-save";
import { LoanEnrollmentDialog } from "./LoanEnrollmentDialog";
import { LoanPaymentDialog } from "./LoanPaymentDialog";
import { LoanDecisionPanel, LoanReleaseDetails } from "./LoanDecisionPanel";
import type { LoanDecisionPreview, LoanDecisionResult } from "../server/loan-decisions";
import { amountToCents, installmentStatus } from "./loan-schedule";
import { DetailSkeleton, RegisterSkeleton } from "./components";

type LoanRow = {
  id: number;
  loanNo: string;
  agreementNo: string;
  memberNo: string | null;
  memberName: string;
  department: string | null;
  productCode: string;
  productName: string;
  productKind: "CASH" | "GOODS";
  itemName: string | null;
  itemQuantity: number;
  principal: string;
  rate: string;
  markup: string;
  method: "DIMINISHING" | "FLAT" | "MARKUP" | "UPFRONT";
  upfrontInterest: string;
  netProceeds: string;
  months: number;
  frequency: "CUTOFF" | "MONTHLY";
  mode: "PAYROLL" | "OTC";
  purpose: string | null;
  status: string;
  releaseMethod: string | null;
  processingFee: string;
  penaltyPercent: string;
  graceDays: number;
  totalPayable: string;
  appliedOn: string | null;
  approvedOn: string | null;
  releasedOn: string | null;
  balance: string;
  pastDue: string;
  penalties: string;
  paidCount: number;
  installmentCount: number;
  nextDueDate: string | null;
  documents: {
    required: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
    done: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
    missing: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
    warnings: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
    blocks: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
  };
  agreementSigned: boolean;
};

type Register = {
  tiles: {
    active: { count: number; balance: string };
    pending: { count: number; principal: string };
    approved: { count: number };
    pastDue: { count: number; amount: string; penalties: string };
  };
  rows: LoanRow[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  filterOptions: {
    products: Array<{ code: string; name: string; open: boolean }>;
    statuses: string[];
    modes: string[];
  };
};

type Installment = {
  no: number;
  dueDate: string;
  principal: string;
  interest: string;
  total: string;
  paidTotal: string;
  paidPrincipal: string;
  paidInterest: string;
  penaltyAssessed: string;
  penaltyPaid: string;
  status: "UNPAID" | "PARTIAL" | "PAID";
};

type Detail = {
  loan: LoanRow & { signedPricing: { paymentCount: number; regularPayment: string; finalPayment: string } | null };
  installments: Installment[];
  payments: Array<{
    id: number; officialReceiptNo: string | null; referenceNo: string | null;
    amount: string; principal: string; interest: string; penalty: string;
    channel: string; receiptDate: string | null; businessDate: string | null; postedAt: string | null; status: string; journalNo: string | null;
  }>;
  documents: Array<{
    id: string; documentTypeId: number; fileName: string; mimeType: string;
    sizeBytes: number; uploadedAt: string | null; uploadedBy: number | null; removedAt: string | null;
  }>;
  history: Array<{ date: string; text: string; actor: string | null }>;
  documentOptions?: { storageReady: boolean; uploadTypes: Array<{ id: number; name: string }> };
  release?: LoanDecisionResult | null;
};

const todayManila = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const date = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00+08:00`);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }).format(parsed);
};
const statusText = (value: string) => value === "APPROVED" ? "For release" : value.replaceAll("_", " ").toLowerCase().replace(/^./, character => character.toUpperCase());
const tabTriggerClass = "shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:bg-background";

export default function LoansModule() {
  const [search, setSearch] = useState("");
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [missingDocs, setMissingDocs] = useState(false);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Register>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ id: number; tab?: "documents" | "review"; releaseNow?: boolean }>();
  const [enrolling, setEnrolling] = useState(false);
  const [saved, setSaved] = useState<LoanEnrollmentResult>();

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set("search", search.trim());
    if (product) params.set("product", product);
    if (status) params.set("status", status);
    if (mode) params.set("mode", mode);
    if (missingDocs) params.set("missingDocs", "true");
    return params.toString();
  }, [search, product, status, mode, missingDocs, page]);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/fm/cooperative/loans?${query}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) throw new Error(payload?.message || "Unable to load the loan register.");
      if (signal.aborted) return;
      const result = payload as Register;
      const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
      if (result.page > lastPage) {
        setPage(lastPage);
        return;
      }
      setData(result);
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load the loan register.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, attempt]);

  useEffect(() => {
    const refreshOnFocus = () => setAttempt(value => value + 1);
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);

  function changeFilter(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  function toggleStatus(value: string) {
    setStatus(current => current === value ? "" : value);
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setProduct("");
    setStatus("");
    setMode("");
    setMissingDocs(false);
    setPage(1);
  }

  const hasFilters = Boolean(search.trim() || product || status || mode || missingDocs);
  const hasMore = data ? data.page * data.pageSize < data.total : false;
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const kpis = data ? [
    {
      key: "ACTIVE", icon: Wallet, label: "Active", value: data.tiles.active.count,
      detail: `${peso(data.tiles.active.balance)} receivable`, tone: "emerald" as const, activeRing: "ring-emerald-500/40", alert: false,
    },
    {
      key: "PENDING", icon: CircleDollarSign, label: "For approval", value: data.tiles.pending.count,
      detail: `${peso(data.tiles.pending.principal)} requested`, tone: "amber" as const, activeRing: "ring-amber-500/40", alert: false,
    },
    {
      key: "APPROVED", icon: CheckCircle2, label: "For release", value: data.tiles.approved.count,
      detail: "Approved, not yet released", tone: "sky" as const, activeRing: "ring-sky-500/40", alert: false,
    },
    {
      key: "PAST_DUE", icon: AlertTriangle, label: "Past due", value: data.tiles.pastDue.count,
      detail: `${peso(data.tiles.pastDue.amount)} behind · ${peso(data.tiles.pastDue.penalties)} penalties`,
      tone: "rose" as const, activeRing: "ring-rose-500/40", alert: data.tiles.pastDue.count > 0,
    },
  ] : [];

  return (
    <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-emerald-500/5 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <HandCoins className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cooperative</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Loans</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Enroll signed loans, track approval and release, and manage payments and supporting documents.
              </p>
            </div>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" onClick={() => setEnrolling(true)}>
            <Plus className="size-4" /> Enroll loan
          </Button>
        </div>
      </section>

      {saved && (
        <div role="status" className="flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Loan saved for approval</p>
            <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px]">
              <span className="rounded-md border border-emerald-200 bg-background/70 px-2 py-1">{saved.loanNo}</span>
              <span className="rounded-md border border-emerald-200 bg-background/70 px-2 py-1">{saved.agreementNo}</span>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => setSaved(undefined)} aria-label="Dismiss loan notice">
            <X className="size-4" />
          </Button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
        </div>
      )}

      {!data && loading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted/30" />)}
        </div>
      )}

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(kpi => (
            <button
              key={kpi.key}
              type="button"
              className={cn(
                "rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                status === kpi.key && `ring-2 ring-offset-2 ring-offset-background ${kpi.activeRing}`,
              )}
              onClick={() => toggleStatus(kpi.key)}
              aria-pressed={status === kpi.key}
            >
              <MetricCard
                icon={kpi.icon}
                label={kpi.label}
                value={kpi.value}
                detail={kpi.detail}
                tone={kpi.tone}
                alert={kpi.alert}
              />
            </button>
          ))}
        </div>
      )}

      <Panel title="Loan register" description="Search loans and open a row for the agreement, schedule, payments, and documents.">
        <div className="mb-4 rounded-xl border bg-muted/20 p-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground sm:col-span-2 xl:col-span-4">
              Search
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={event => { setSearch(event.target.value); setPage(1); }}
                  placeholder="Loan number, member, agreement, or purpose"
                  className="h-9 pl-8"
                />
              </div>
            </label>
            <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
              Product
              <NativeSelect value={product} onChange={event => changeFilter(setProduct)(event.target.value)} className="h-9 w-full">
                <option value="">All products</option>
                {data?.filterOptions.products.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
              </NativeSelect>
            </label>
            <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
              Status
              <NativeSelect value={status} onChange={event => changeFilter(setStatus)(event.target.value)} className="h-9 w-full">
                <option value="">All statuses</option>
                {data?.filterOptions.statuses.filter(value => value !== "MISSING_DOCS").map(value => (
                  <option key={value} value={value}>{statusText(value)}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
              Repayment
              <NativeSelect value={mode} onChange={event => changeFilter(setMode)(event.target.value)} className="h-9 w-full">
                <option value="">Any mode</option>
                <option value="PAYROLL">Salary deduction</option>
                <option value="OTC">Over the counter</option>
              </NativeSelect>
            </label>
            <div className="flex items-end">
              <Button
                type="button"
                variant={missingDocs ? "default" : "outline"}
                aria-pressed={missingDocs}
                className="h-9 w-full"
                onClick={() => { setMissingDocs(value => !value); setPage(1); }}
              >
                <FolderClosed className="size-3.5" /> Missing documents
              </Button>
            </div>
            <div className="flex items-end justify-between gap-2 sm:col-span-2 xl:col-span-4">
              <p className="text-xs text-muted-foreground">
                {loading ? "Updating register..." : `${data?.total ?? 0} loan${data?.total === 1 ? "" : "s"} match`}
              </p>
              {hasFilters && (
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearFilters}>
                  <X className="size-3.5" /> Clear filters
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="min-w-52">Loan</TableHead>
                <TableHead className="min-w-48">Member</TableHead>
                <TableHead className="hidden 2xl:table-cell">Terms</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Documents</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Principal</TableHead>
                <TableHead className="whitespace-nowrap text-right">Balance</TableHead>
                <TableHead className="hidden whitespace-nowrap text-right lg:table-cell">Past due</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody className={cn("transition-opacity", loading && data && "opacity-60")}>
              {loading && !data && <RegisterSkeleton />}
              {!loading && data?.rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9}>
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><SearchX className="size-5" /></span>
                      <p className="text-sm font-medium">No loans match these filters</p>
                      <p className="max-w-sm text-xs text-muted-foreground">Try a different loan number, member, product, or status.</p>
                      {hasFilters && <Button type="button" variant="outline" size="sm" className="mt-1" onClick={clearFilters}>Clear filters</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {data?.rows.map(loan => (
                <LoanRegisterRow key={loan.id} loan={loan} onOpen={() => setSelected({ id: loan.id })} />
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
          <span>
            {data && data.total > 0
              ? <>Showing <span className="font-medium text-foreground">{from}-{to}</span> of <span className="font-medium text-foreground">{data.total}</span></>
              : "No records"}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>
              <ChevronLeft className="size-3.5" /> Previous
            </Button>
            <span className="min-w-14 text-center font-medium text-foreground">Page {data?.page ?? page}</span>
            <Button size="sm" variant="outline" disabled={!hasMore || loading} onClick={() => setPage(value => value + 1)}>
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </Panel>

      {enrolling && <LoanEnrollmentDialog onClose={() => setEnrolling(false)} onSaved={(result, release) => {
        setEnrolling(false);
        setSaved(result);
        setSelected({ id: result.id, tab: release.requested && !release.reviewDocuments ? "review" : "documents", releaseNow: release.requested });
        setAttempt(value => value + 1);
      }} />}
      {selected && <LoanDialog key={selected.id} id={selected.id} initialTab={selected.tab}
        decisionEndpoint={"/api/fm/cooperative/loans/" + selected.id + "/decision"} approveAndRelease={selected.releaseNow}
        paymentEndpoint={`/api/fm/cooperative/loans/${selected.id}/payments`} onPayment={() => setAttempt(value => value + 1)}
        onDocumentsChanged={() => setAttempt(value => value + 1)} onDecision={() => setAttempt(value => value + 1)}
        onClose={() => setSelected(undefined)} />}
    </main>
  );
}

function LoanRegisterRow({ loan, onOpen }: { loan: LoanRow; onOpen: () => void }) {
  const docs = loan.documents;
  const docsComplete = docs.required.length > 0 && docs.missing.length === 0;
  const pastDue = loan.status === "ACTIVE" && loan.pastDue !== "0.00";
  return (
    <TableRow
      tabIndex={0}
      aria-label={`Open ${loan.loanNo}`}
      className="group cursor-pointer transition-colors focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/30"
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <TableCell className="whitespace-normal">
        <p className="font-mono text-sm font-medium">{loan.loanNo}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{loan.productName}</p>
        <span className="mt-1 hidden rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground xl:inline-block">
          {loan.agreementNo}
        </span>
      </TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={loan.memberName} />
          <div className="min-w-0">
            <p className="truncate font-medium">{loan.memberName}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {loan.memberNo ?? "No member no."}
              {loan.department && <><span className="mx-1 text-muted-foreground/50">/</span>{loan.department}</>}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden whitespace-nowrap 2xl:table-cell">
        {loan.months} months
        <span className="mt-0.5 block whitespace-nowrap text-xs text-muted-foreground">
          {loan.frequency === "CUTOFF" ? "Cutoff" : "Monthly"} · {loan.mode === "PAYROLL" ? "Payroll" : "OTC"}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <StatusChip status={pastDue ? "PAST_DUE" : loan.status} label={loan.status === "APPROVED" ? "For release" : undefined} />
        {loan.status === "ACTIVE" && loan.nextDueDate && (
          <span className="mt-1 block whitespace-nowrap text-[11px] text-muted-foreground">Next {date(loan.nextDueDate)}</span>
        )}
      </TableCell>
      <TableCell className="hidden whitespace-nowrap lg:table-cell">
        {docs.required.length === 0
          ? <span className="whitespace-nowrap text-xs text-muted-foreground">None required</span>
          : docsComplete
            ? <StatusChip status="ACTIVE" label="Complete" />
            : <StatusChip status="PARTIAL" label={`${docs.done.length}/${docs.required.length}`} />}
      </TableCell>
      <TableCell className="hidden text-right font-mono tabular-nums lg:table-cell">{peso(loan.principal)}</TableCell>
      <TableCell className="text-right font-mono font-medium tabular-nums">
        {loan.status === "ACTIVE" ? peso(loan.balance) : "—"}
        {pastDue && (
          <span className="mt-1 block whitespace-nowrap font-sans text-xs font-normal text-rose-600 dark:text-rose-400 lg:hidden">
            {peso(loan.pastDue)} past due
          </span>
        )}
      </TableCell>
      <TableCell className="hidden text-right font-mono tabular-nums lg:table-cell">{pastDue ? peso(loan.pastDue) : "—"}</TableCell>
      <TableCell>
        <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      </TableCell>
    </TableRow>
  );
}

export function LoanDialog({ id, endpoint = "/api/fm/cooperative/loans/" + id, initialTab = "summary",
  decisionEndpoint, approveAndRelease, paymentEndpoint, onPayment, onDecision, onDocumentsChanged, onClose }: {
  id: number;
  endpoint?: string;
  initialTab?: "summary" | "documents" | "review";
  decisionEndpoint?: string;
  approveAndRelease?: boolean;
  paymentEndpoint?: string;
  onPayment?: () => void;
  onDecision?: () => void;
  onDocumentsChanged?: () => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<string>(initialTab);
  const [decision, setDecision] = useState<LoanDecisionResult>();
  const [decisionPreview, setDecisionPreview] = useState<LoanDecisionPreview>();
  const [decisionPreviewLoading, setDecisionPreviewLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) throw new Error(payload?.message || "Unable to load this loan.");
        return payload as Detail;
      })
      .then(payload => { if (!controller.signal.aborted) setDetail(payload); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load this loan."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, attempt]);

  const loan = detail?.loan;
  const reviewLoanId = loan?.id;
  const reviewLoanStatus = loan?.status;

  // Load the review checks alongside the detail so opening the Review tab does not wait for both.
  useEffect(() => {
    if (!decisionEndpoint || !reviewLoanId || (reviewLoanStatus !== "PENDING" && reviewLoanStatus !== "APPROVED")) {
      setDecisionPreview(undefined);
      setDecisionPreviewLoading(false);
      return;
    }
    const controller = new AbortController();
    setDecisionPreviewLoading(true);
    fetch(decisionEndpoint, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) throw new Error(payload?.message || "Unable to load the loan checks.");
        return payload as LoanDecisionPreview;
      })
      .then(payload => { if (!controller.signal.aborted) setDecisionPreview(payload); })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setDecisionPreviewLoading(false); });
    return () => controller.abort();
  }, [decisionEndpoint, reviewLoanId, reviewLoanStatus]);
  const docs = loan?.documents;
  const status = decision?.status ?? loan?.status;
  const showReview = decisionEndpoint && (status === "PENDING" || status === "APPROVED");
  const pastDue = loan ? loan.pastDue !== "0.00" : false;
  const chipStatus = status === "ACTIVE" && pastDue ? "PAST_DUE" : status;

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title={(
        <span className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={loan?.memberName ?? `Loan ${id}`} size="lg" />
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-mono">{loan?.loanNo ?? `Loan ${id}`}</span>
              {chipStatus && <StatusChip status={chipStatus} label={chipStatus === "APPROVED" ? "For release" : undefined} />}
            </span>
            <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
              {loan ? `${loan.memberName}${loan.memberNo ? ` · ${loan.memberNo}` : ""}` : "Loading loan..."}
            </span>
          </span>
        </span>
      )}
      description={loan ? `${loan.productName} · Agreement ${loan.agreementNo}` : undefined}
      footerClassName="backdrop-blur"
      footer={<>
        <Button variant="outline" className="sm:mr-auto" onClick={onClose}>Close</Button>
        {paymentEndpoint && status === "ACTIVE" && !loading && !error && (
          <Button onClick={() => setPaying(true)}><Receipt className="size-4" /> Post payment</Button>
        )}
      </>}
      wide
    >
      {loading && <DetailSkeleton />}
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{error}</p>
          <Button variant="outline" size="sm" type="button" onClick={() => setAttempt(value => value + 1)}>Retry loan details</Button>
        </div>
      )}
      {detail && loan && (
        <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
          {decision && (
            <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
              {decision.status === "ACTIVE" ? `Loan released · ${decision.journalNo}`
                : decision.status === "APPROVED" ? "Loan approved and ready for release." : "Loan rejected."}
            </p>
          )}
          <TabsList className="flex h-auto w-full max-w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
            <TabsTrigger value="summary" className={tabTriggerClass}><LayoutDashboard className="size-3.5" /> Summary</TabsTrigger>
            <TabsTrigger value="agreement" className={tabTriggerClass}><FileText className="size-3.5" /> Agreement</TabsTrigger>
            <TabsTrigger value="schedule" className={tabTriggerClass}><CalendarDays className="size-3.5" /> Schedule</TabsTrigger>
            <TabsTrigger value="payments" className={tabTriggerClass}><Receipt className="size-3.5" /> Payments</TabsTrigger>
            <TabsTrigger value="documents" className={tabTriggerClass}>
              <FolderClosed className="size-3.5" /> Documents{docs?.missing.length ? ` (${docs.missing.length})` : ""}
            </TabsTrigger>
            {showReview && <TabsTrigger value="review" className={tabTriggerClass}><ShieldCheck className="size-3.5" /> Review</TabsTrigger>}
          </TabsList>

          <TabsContent value="summary" className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={Wallet}
                label="Principal"
                value={peso(loan.principal)}
                detail={loan.itemName ?? loan.purpose ?? undefined}
                tone="emerald"
              />
              <MetricCard
                icon={TrendingUp}
                label={loan.productKind === "GOODS" ? "Markup" : "Interest"}
                value={loan.productKind === "GOODS" ? `${loan.markup}%` : `${loan.rate}%${loan.method === "UPFRONT" ? " upfront" : " / mo"}`}
                detail={loan.productKind === "GOODS" ? "Catalog price markup" : statusText(loan.method)}
                tone="sky"
              />
              <MetricCard
                icon={CalendarDays}
                label="Term"
                value={`${loan.months} mo`}
                detail={`${loan.frequency === "CUTOFF" ? "Every cutoff" : "Monthly"} · ${loan.mode === "PAYROLL" ? "Salary deduction" : "Over the counter"}`}
                tone="slate"
              />
              <MetricCard
                icon={HandCoins}
                label="Balance"
                value={peso(loan.balance)}
                detail={pastDue ? `${peso(loan.pastDue)} past due` : "Current"}
                tone={pastDue ? "rose" : "emerald"}
                alert={pastDue}
              />
            </div>
            {(detail.release ?? (decision?.journalNo ? decision : null)) && <LoanReleaseDetails release={(detail.release ?? decision)!} />}
            {showReview && (
              <div>
                <Button type="button" variant="outline" onClick={() => setTab("review")}>
                  <ShieldCheck className="size-4" /> {status === "PENDING" ? "Review pending loan" : "Review release"}
                </Button>
              </div>
            )}
            <Panel title="Repayment progress" description="Installments posted against the released schedule.">
              <Progress value={loan.paidCount} max={loan.installmentCount || 1} />
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>{loan.paidCount} of {loan.installmentCount} installments paid</span>
                <span>{peso(loan.penalties)} penalties due</span>
              </div>
            </Panel>
            <Panel title="History">
              {detail.history.length
                ? <ol className="space-y-3">
                  {detail.history.map((entry, index) => (
                    <li key={`${entry.date}-${index}`} className="flex gap-3">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500/70" />
                      <div className="min-w-0">
                        <p className="text-sm">{entry.text}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {date(entry.date)}{entry.actor ? ` · ${entry.actor}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                : <EmptyState>No history recorded.</EmptyState>}
            </Panel>
          </TabsContent>

          <TabsContent value="agreement" className="mt-4">
            <div className="max-w-3xl space-y-3 rounded-xl border bg-muted/20 p-4 text-sm leading-6">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2">
                <span className="font-semibold">Loan Agreement & Promissory Note</span>
                <span className="rounded-md border bg-background/70 px-2 py-0.5 font-mono text-xs">{loan.agreementNo}</span>
              </div>
              <p>
                {loan.memberName}{loan.memberNo ? ` (${loan.memberNo})` : ""} borrows <strong>{peso(loan.principal)}</strong> under the <strong>{loan.productName}</strong> program
                {loan.itemName ? ` for ${loan.itemName}${loan.itemQuantity > 1 ? ` × ${loan.itemQuantity}` : ""}` : loan.purpose ? ` for ${loan.purpose}` : ""}.
              </p>
              <p>
                Total payable <strong>{peso(loan.totalPayable)}</strong> over <strong>{loan.months} months</strong> by {loan.mode === "PAYROLL" ? "salary deduction" : "over-the-counter payment"}.
              </p>
              <Kv rows={[
                ...(loan.signedPricing ? [
                  ["Payment count", loan.signedPricing.paymentCount],
                  ["Regular installment", peso(loan.signedPricing.regularPayment)],
                  ["Final installment", peso(loan.signedPricing.finalPayment)],
                ] as [string, string | number][] : []),
                [loan.productKind === "GOODS" ? "Markup" : loan.method === "UPFRONT" ? "Upfront interest rate" : "Monthly interest", loan.productKind === "GOODS" ? loan.markup + "%" : loan.rate + "% · " + statusText(loan.method)],
                ...(loan.method === "UPFRONT" ? [["Upfront interest withheld", peso(loan.upfrontInterest)], ["Net payout", peso(loan.netProceeds)]] as [string, string][] : []),
                ["Processing fee on release", peso(loan.processingFee)],
                ["Late penalty", loan.penaltyPercent + "% after " + loan.graceDays + " days"],
                ["Applied", date(loan.appliedOn)],
                ["Approved", date(loan.approvedOn)],
                ["Released", date(loan.releasedOn)],
                ["Release method", loan.releaseMethod ?? "—"],
                ["Signed agreement", loan.agreementSigned ? "Member signed" : "Not recorded"],
              ]} />
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="mt-4">
            <div className="max-h-[55dvh] overflow-auto rounded-lg border">
              <Table className="min-w-[720px]">
                <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>#</TableHead><TableHead>Due</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.installments.length === 0 && <TableRow><TableCell colSpan={7}><EmptyState>No schedule has been created yet.</EmptyState></TableCell></TableRow>}
                  {detail.installments.map(installment => {
                    const overdue = installmentStatus(installment) !== "PAID" && installment.dueDate < todayManila();
                    return (
                      <TableRow key={installment.no} className="hover:bg-muted/30">
                        <TableCell className="font-mono">{installment.no}</TableCell>
                        <TableCell className="whitespace-nowrap">{date(installment.dueDate)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{peso(installment.principal)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{peso(installment.interest)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{peso(installment.total)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{amountToCents(installment.paidTotal) > 0n ? peso(installment.paidTotal) : "—"}</TableCell>
                        <TableCell><StatusChip status={installmentStatus(installment) === "PAID" ? "PAID" : overdue ? "PAST_DUE" : installmentStatus(installment)} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="mt-4">
            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[760px]">
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Posting date</TableHead><TableHead>Channel</TableHead><TableHead>Reference</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Interest or markup</TableHead>
                    <TableHead className="text-right">Penalty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.payments.length === 0 && <TableRow><TableCell colSpan={7}><EmptyState>No payments posted yet.</EmptyState></TableCell></TableRow>}
                  {detail.payments.map(item => (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="whitespace-nowrap">
                        {date(item.businessDate)}
                        {item.businessDate !== item.receiptDate && <div className="text-xs text-muted-foreground">Received {date(item.receiptDate)}</div>}
                      </TableCell>
                      <TableCell>
                        {item.channel === "CLEARANCE" ? "Exit clearance" : item.channel === "PAYROLL" ? "Payroll remittance" : "Over the counter"}
                        {item.status === "REVERSAL" && <div className="text-xs text-muted-foreground">Reversal</div>}
                        {item.status === "REVERSED" && <div className="text-xs text-muted-foreground">Reversed</div>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <div>
                          {paymentEndpoint && item.officialReceiptNo ? (
                            <a className="underline underline-offset-2" href={`${paymentEndpoint}?receipt=${item.id}`} target="_blank" rel="noreferrer">{item.officialReceiptNo}</a>
                          ) : item.officialReceiptNo ?? item.referenceNo ?? item.journalNo ?? "—"}
                        </div>
                        {item.journalNo && (item.officialReceiptNo || item.referenceNo) && <div className="text-muted-foreground">{item.journalNo}</div>}
                        {item.channel === "PAYROLL" && item.status === "POSTED" && <div className="text-muted-foreground">Payment ID {item.id}</div>}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{peso(item.principal)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{peso(item.interest)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{peso(item.penalty)}</TableCell>
                      <TableCell className="text-right font-mono font-medium tabular-nums">{peso(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="documents" className="mt-4 space-y-3">
            {showReview && status === "PENDING" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <span>{docs?.blocks.length ? "Attach the required documents, then review the payout." : "The signed loan is filed. Review and confirm payout when ready."}</span>
                <Button type="button" variant="outline" disabled={!!docs?.blocks.length || loading} onClick={() => setTab("review")}>Continue to release</Button>
              </div>
            )}
            {detail.documentOptions && docs ? (
              <CooperativeDocuments
                endpoint={endpoint + "/documents"} required={docs.required} uploadTypes={detail.documentOptions.uploadTypes}
                storageReady={detail.documentOptions.storageReady} canEdit
                requirementSource="The signed loan agreement sets these requirements."
                onChanged={() => { setAttempt(value => value + 1); onDocumentsChanged?.(); }}
              />
            ) : (
              <>
                {!docs?.required.length && <EmptyState>No required documents recorded.</EmptyState>}
                {docs?.required.map(document => {
                  const uploaded = docs.done.some(item => item.documentTypeId === document.documentTypeId);
                  return (
                    <div key={document.documentTypeId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                      <span>{document.name}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline">{document.enforcement}</Badge>
                        <StatusChip status={uploaded ? "ACTIVE" : "PARTIAL"} label={uploaded ? "On file" : "Missing"} />
                      </span>
                    </div>
                  );
                })}
                {detail.documents.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Files on record</h3>
                    {detail.documents.map(document => (
                      <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                        <span>{document.fileName}</span>
                        <span className="text-xs text-muted-foreground">{date(document.uploadedAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
          {showReview && (
            <TabsContent value="review" className="mt-4">
              <LoanDecisionPanel
                key={attempt}
                endpoint={decisionEndpoint}
                initialPreview={decisionPreview}
                initialPreviewLoading={decisionPreviewLoading}
                approveAndRelease={approveAndRelease && status === "PENDING"}
                onChanged={result => {
                  setDecision(result);
                  setTab("summary");
                  setAttempt(value => value + 1);
                  onDecision?.();
                }}
              />
            </TabsContent>
          )}
        </Tabs>
      )}
      {paying && paymentEndpoint && (
        <LoanPaymentDialog
          loanId={id}
          endpoint={paymentEndpoint}
          onClose={() => setPaying(false)}
          onPosted={() => {
            setDecision(undefined);
            setTab("payments");
            setAttempt(value => value + 1);
            onPayment?.();
          }}
        />
      )}
    </ConsoleDialog>
  );
}
