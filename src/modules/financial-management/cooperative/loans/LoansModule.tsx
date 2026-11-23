"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ConsoleDialog, EmptyState, FilterBar, FilterField, Kv, Panel, Progress, StatusChip, Tile,
} from "../console/components/ui";
import { peso } from "../members/format";
import { CooperativeDocuments } from "../members/MemberDocuments";
import type { LoanEnrollmentResult } from "../server/loan-enrollment-save";
import { LoanEnrollmentDialog } from "./LoanEnrollmentDialog";
import { LoanDecisionPanel, LoanReleaseDetails } from "./LoanDecisionPanel";
import type { LoanDecisionResult } from "../server/loan-decisions";
import { amountToCents, installmentStatus } from "./loan-schedule";

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
  method: "DIMINISHING" | "FLAT" | "MARKUP";
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
    channel: string; receiptDate: string | null; postedAt: string | null; status: string; journalNo: string | null;
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
      if (!signal.aborted) setData(payload as Register);
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

  function changeFilter(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Cooperative</p>
          <h1 className="text-2xl font-semibold tracking-tight">Loans</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Enroll signed loans, track their approval status, and manage supporting documents.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Live register</Badge>
          <Button size="sm" onClick={() => setEnrolling(true)}>
            Enroll loan
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
        </div>
      )}
      {saved && <div role="status" className="rounded-md border border-emerald-600/40 bg-emerald-500/5 px-3 py-2 text-sm">
        {saved.loanNo} · {saved.agreementNo} saved for approval.
      </div>}

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile label="Active" value={data.tiles.active.count} detail={`${peso(data.tiles.active.balance)} receivable`} />
          <Tile label="For approval" value={data.tiles.pending.count} detail={`${peso(data.tiles.pending.principal)} requested`} />
          <Tile label="For release" value={data.tiles.approved.count} detail="Approved, not yet released" />
          <Tile
            label="Past due"
            value={data.tiles.pastDue.count}
            detail={`${peso(data.tiles.pastDue.amount)} behind · ${peso(data.tiles.pastDue.penalties)} penalties`}
            alert={data.tiles.pastDue.count > 0}
          />
        </div>
      )}

      <Panel title="Loan register" description="Open a row for the agreement, schedule, payments, and documents.">
        <FilterBar count={data?.total ?? 0} noun="loans">
          <FilterField label="Search">
            <Input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Loan no., member, agreement or purpose" className="h-8 w-72" />
          </FilterField>
          <FilterField label="Product">
            <NativeSelect value={product} onChange={event => changeFilter(setProduct)(event.target.value)} className="h-8">
              <option value="">All products</option>
              {data?.filterOptions.products.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
            </NativeSelect>
          </FilterField>
          <FilterField label="Status">
            <NativeSelect value={status} onChange={event => changeFilter(setStatus)(event.target.value)} className="h-8">
              <option value="">All statuses</option>
              {data?.filterOptions.statuses.map(value => <option key={value} value={value}>{statusText(value)}</option>)}
            </NativeSelect>
          </FilterField>
          <FilterField label="Repayment">
            <NativeSelect value={mode} onChange={event => changeFilter(setMode)(event.target.value)} className="h-8">
              <option value="">Any</option>
              <option value="PAYROLL">Salary deduction</option>
              <option value="OTC">Over the counter</option>
            </NativeSelect>
          </FilterField>
          <FilterField label="Documents">
            <label className="flex h-8 items-center gap-2 text-xs">
              <input type="checkbox" checked={missingDocs} onChange={event => { setMissingDocs(event.target.checked); setPage(1); }} />
              Missing documents
            </label>
          </FilterField>
        </FilterBar>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loan</TableHead><TableHead>Member</TableHead><TableHead>Terms</TableHead><TableHead>Status</TableHead>
                <TableHead>Documents</TableHead><TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Balance</TableHead><TableHead className="text-right">Past due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !data && <TableRow><TableCell colSpan={8}><EmptyState>Loading loans…</EmptyState></TableCell></TableRow>}
              {!loading && data?.rows.length === 0 && <TableRow><TableCell colSpan={8}><EmptyState>No loans match these filters.</EmptyState></TableCell></TableRow>}
              {data?.rows.map(loan => {
                const docs = loan.documents;
                const docsComplete = docs.required.length > 0 && docs.missing.length === 0;
                return (
                  <TableRow key={loan.id} className="cursor-pointer" onClick={() => setSelected({ id: loan.id })}>
                    <TableCell className="whitespace-normal">
                      <p className="font-mono text-sm font-medium">{loan.loanNo}</p>
                      <p className="text-xs text-muted-foreground">{loan.productName}</p>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {loan.memberName}
                      <span className="block text-xs text-muted-foreground">{loan.memberNo ?? loan.department ?? ""}</span>
                    </TableCell>
                    <TableCell>
                      {loan.months} months
                      <span className="block text-xs text-muted-foreground">
                        {loan.frequency === "CUTOFF" ? "Every cutoff" : "Monthly"} · {loan.mode === "PAYROLL" ? "Salary deduction" : "Over the counter"}
                      </span>
                    </TableCell>
                    <TableCell><StatusChip status={loan.pastDue !== "0.00" && loan.status === "ACTIVE" ? "PAST_DUE" : loan.status}
                      label={loan.status === "APPROVED" ? "For release" : undefined} /></TableCell>
                    <TableCell>
                      {docs.required.length === 0 || docsComplete
                        ? <StatusChip status="ACTIVE" label="Complete" />
                        : <StatusChip status="PARTIAL" label={`${docs.done.length}/${docs.required.length}`} />}
                    </TableCell>
                    <TableCell className="text-right font-mono">{peso(loan.principal)}</TableCell>
                    <TableCell className="text-right font-mono">{loan.status === "ACTIVE" ? peso(loan.balance) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{loan.status === "ACTIVE" && loan.pastDue !== "0.00" ? peso(loan.pastDue) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Page {data?.page ?? page}{data ? ` · ${data.total} loans` : ""}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={!data?.hasMore || loading} onClick={() => setPage(value => value + 1)}>Next</Button>
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
        onDocumentsChanged={() => setAttempt(value => value + 1)} onDecision={() => setAttempt(value => value + 1)}
        onClose={() => setSelected(undefined)} />}
    </main>
  );
}

export function LoanDialog({ id, endpoint = "/api/fm/cooperative/loans/" + id, initialTab = "summary",
  decisionEndpoint, approveAndRelease, onDecision, onDocumentsChanged, onClose }: {
  id: number;
  endpoint?: string;
  initialTab?: "summary" | "documents" | "review";
  decisionEndpoint?: string;
  approveAndRelease?: boolean;
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
  const docs = loan?.documents;
  const status = decision?.status ?? loan?.status;
  const showReview = decisionEndpoint && (status === "PENDING" || status === "APPROVED");

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{loan?.loanNo ?? `Loan ${id}`}</span>{status && <StatusChip status={status} label={status === "APPROVED" ? "For release" : undefined} />}</span>}
      description={loan ? `${loan.memberName}${loan.memberNo ? ` · ${loan.memberNo}` : ""} · ${loan.productName}` : "Loading loan…"}
      wide
    >
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading loan details…</p>}
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <p>{error}</p>
          <Button variant="outline" size="sm" type="button" onClick={() => setAttempt(value => value + 1)}>Retry loan details</Button>
        </div>
      )}
      {detail && loan && (
        <Tabs value={tab} onValueChange={setTab}>
          {decision && <p role="status" className="mb-3 rounded-md border p-3 text-sm">
            {decision.status === "ACTIVE" ? `Loan released · ${decision.journalNo}`
              : decision.status === "APPROVED" ? "Loan approved and ready for release." : "Loan rejected."}
          </p>}
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="agreement">Agreement</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="documents">Documents{docs?.missing.length ? ` (${docs.missing.length} missing)` : ""}</TabsTrigger>
            {showReview && <TabsTrigger value="review">Review</TabsTrigger>}
          </TabsList>

          <TabsContent value="summary" className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Principal" value={peso(loan.principal)} />
              <Tile label={loan.productKind === "GOODS" ? "Markup" : "Rate"} value={loan.productKind === "GOODS" ? `${loan.markup}%` : `${loan.rate}% / mo`} />
              <Tile label="Term" value={`${loan.months} mo`} detail={`${loan.frequency === "CUTOFF" ? "Every cutoff" : "Monthly"} · ${loan.mode === "PAYROLL" ? "Salary deduction" : "Over the counter"}`} />
              <Tile label="Balance" value={peso(loan.balance)} detail={loan.pastDue !== "0.00" ? `${peso(loan.pastDue)} past due` : "Current"} alert={loan.pastDue !== "0.00"} />
            </div>
            {(detail.release ?? (decision?.journalNo ? decision : null)) && <LoanReleaseDetails release={(detail.release ?? decision)!} />}
            {showReview && <div><Button type="button" variant="outline" onClick={() => setTab("review")}>{status === "PENDING" ? "Review pending loan" : "Review release"}</Button></div>}
            <Panel title="Progress">
              <Progress value={loan.paidCount} max={loan.installmentCount || 1} />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{loan.paidCount} of {loan.installmentCount} installments paid</span>
                <span>{peso(loan.penalties)} penalties due</span>
              </div>
            </Panel>
            <Panel title="History">
              {detail.history.length
                ? <ul className="space-y-1 text-sm text-muted-foreground">{detail.history.map((entry, index) => <li key={`${entry.date}-${index}`}>{date(entry.date)}: {entry.text}{entry.actor ? ` · ${entry.actor}` : ""}</li>)}</ul>
                : <EmptyState>No history recorded.</EmptyState>}
            </Panel>
          </TabsContent>

          <TabsContent value="agreement" className="mt-4">
            <div className="max-w-3xl space-y-3 rounded-lg border bg-muted/30 p-4 text-sm leading-6">
              <div className="flex flex-wrap justify-between gap-2 border-b pb-2 font-semibold">
                <span>Loan Agreement & Promissory Note</span>
                <span className="font-mono">{loan.agreementNo}</span>
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
                [loan.productKind === "GOODS" ? "Markup" : "Monthly interest", loan.productKind === "GOODS" ? loan.markup + "%" : loan.rate + "% · " + statusText(loan.method)],
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
            <div className="max-h-[55dvh] overflow-auto rounded-md border">
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Principal</TableHead><TableHead className="text-right">Interest</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {detail.installments.length === 0 && <TableRow><TableCell colSpan={7}><EmptyState>No schedule has been created yet.</EmptyState></TableCell></TableRow>}
                  {detail.installments.map(installment => {
                    const pastDue = installmentStatus(installment) !== "PAID" && installment.dueDate < todayManila();
                    return <TableRow key={installment.no}>
                      <TableCell className="font-mono">{installment.no}</TableCell>
                      <TableCell>{date(installment.dueDate)}</TableCell>
                      <TableCell className="text-right font-mono">{peso(installment.principal)}</TableCell>
                      <TableCell className="text-right font-mono">{peso(installment.interest)}</TableCell>
                      <TableCell className="text-right font-mono">{peso(installment.total)}</TableCell>
                      <TableCell className="text-right font-mono">{amountToCents(installment.paidTotal) > 0n ? peso(installment.paidTotal) : "—"}</TableCell>
                      <TableCell><StatusChip status={installmentStatus(installment) === "PAID" ? "PAID" : pastDue ? "PAST_DUE" : installmentStatus(installment)} /></TableCell>
                    </TableRow>;
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="mt-4">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Channel</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Principal</TableHead><TableHead className="text-right">Interest</TableHead><TableHead className="text-right">Penalty</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {detail.payments.length === 0 && <TableRow><TableCell colSpan={7}><EmptyState>No payments posted yet.</EmptyState></TableCell></TableRow>}
                {detail.payments.map(item => <TableRow key={item.id}>
                  <TableCell>{date(item.receiptDate)}</TableCell>
                  <TableCell>
                    {item.channel === "CLEARANCE" ? "Exit clearance" : item.channel === "PAYROLL" ? "Payroll remittance" : "Over the counter"}
                    {item.status === "REVERSAL" && <div className="text-xs text-muted-foreground">Reversal</div>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div>{item.officialReceiptNo ?? item.referenceNo ?? item.journalNo ?? "—"}</div>
                    {item.journalNo && (item.officialReceiptNo || item.referenceNo) && <div className="text-muted-foreground">{item.journalNo}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{peso(item.principal)}</TableCell>
                  <TableCell className="text-right font-mono">{peso(item.interest)}</TableCell>
                  <TableCell className="text-right font-mono">{peso(item.penalty)}</TableCell>
                  <TableCell className="text-right font-mono">{peso(item.amount)}</TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="documents" className="mt-4 space-y-3">
            {showReview && approveAndRelease && status === "PENDING" && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span>{docs?.blocks.length ? "Attach the required documents, then review the payout." : "The signed loan is filed. Review and confirm payout when ready."}</span>
              <Button type="button" variant="outline" disabled={!!docs?.blocks.length || loading} onClick={() => setTab("review")}>Continue to release</Button>
            </div>}
            {detail.documentOptions && docs ? <CooperativeDocuments
              endpoint={endpoint + "/documents"} required={docs.required} uploadTypes={detail.documentOptions.uploadTypes}
              storageReady={detail.documentOptions.storageReady} canEdit
              requirementSource="The signed loan agreement sets these requirements."
              onChanged={() => { setAttempt(value => value + 1); onDocumentsChanged?.(); }}
            /> : <>
              {!docs?.required.length && <EmptyState>No required documents recorded.</EmptyState>}
              {docs?.required.map(document => {
                const uploaded = docs.done.some(item => item.documentTypeId === document.documentTypeId);
                return <div key={document.documentTypeId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <span>{document.name}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{document.enforcement}</Badge>
                    <StatusChip status={uploaded ? "ACTIVE" : "PARTIAL"} label={uploaded ? "On file" : "Missing"} />
                  </span>
                </div>;
              })}
              {detail.documents.length > 0 && <div className="space-y-2">
                <h3 className="text-sm font-semibold">Files on record</h3>
                {detail.documents.map(document => <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <span>{document.fileName}</span>
                  <span className="text-xs text-muted-foreground">{date(document.uploadedAt)}</span>
                </div>)}
              </div>}
            </>}
          </TabsContent>
          {showReview && <TabsContent value="review" className="mt-4">
            <LoanDecisionPanel key={attempt} endpoint={decisionEndpoint} approveAndRelease={approveAndRelease && status === "PENDING"}
              onChanged={result => {
                setDecision(result);
                setTab("summary");
                setAttempt(value => value + 1);
                onDecision?.();
              }} />
          </TabsContent>}
        </Tabs>
      )}
    </ConsoleDialog>
  );
}
