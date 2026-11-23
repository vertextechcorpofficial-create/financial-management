"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ConsoleDialog, EmptyState, FilterBar, FilterField, Kv, Panel, StatusChip, Tile,
} from "../console/components/ui";
import { LoanDecisionPanel, LoanReleaseDetails } from "../loans/LoanDecisionPanel";
import type { ApprovalDetail, ApprovalQueue } from "../server/approvals";
import type { LoanDecisionResult } from "../server/loan-decisions";
import { approvalStatuses, approvalTypes, type ApprovalStatusFilter, type ApprovalType } from "./filters";

type Row = ApprovalQueue["rows"][number];
type Source = ApprovalQueue["sources"][number];
type LoadResult<T> = { key: string; data?: T; error?: string };

const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const peso = (value: string | number | null | undefined) => php.format(Number(value ?? 0));
const date = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00+08:00`);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }).format(parsed);
};
const statusLabel = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, character => character.toUpperCase());

async function loadRequest<T>(url: string, signal: AbortSignal, message: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(payload?.message || message);
  return payload as T;
}

export default function ApprovalsModule() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<ApprovalType | "">("");
  const [status, setStatus] = useState<ApprovalStatusFilter>("PENDING");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult<ApprovalQueue>>();
  const [selected, setSelected] = useState<Row | null>(null);

  const params = new URLSearchParams({ page: String(page), status });
  if (search.trim()) params.set("search", search.trim());
  if (type) params.set("type", type);
  const query = params.toString();
  const requestKey = `${query}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    const message = "Unable to load the approval queue.";
    const timer = window.setTimeout(() => {
      loadRequest<ApprovalQueue>(`/api/fm/cooperative/approvals?${query}`, controller.signal, message)
        .then(data => { if (!controller.signal.aborted) setResult({ key: requestKey, data }); })
        .catch(cause => { if (!controller.signal.aborted) setResult({ key: requestKey, error: cause instanceof Error ? cause.message : message }); });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, requestKey]);

  function chooseType(value: ApprovalType | "") {
    setType(value);
    setPage(1);
  }

  const current = result?.key === requestKey ? result : undefined;
  const loading = !current;
  const data = current?.data;
  const source = data?.tiles[type || "loan"];
  const error = current?.error ?? (source?.state === "unavailable" ? source.message : null);
  const total = source?.state === "ready" ? data?.total : undefined;
  const shownPage = data?.page ?? page;

  return (
    <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {approvalTypes.map(option => <SourceTile key={option.value} label={option.label} source={result?.data?.tiles[option.value]}
          active={type === option.value} unavailable={Boolean(current?.error)}
          onClick={() => chooseType(type === option.value ? "" : option.value)} />)}
      </div>

      <Panel title="Request queue" description="Open a request to review its details, document status, and history.">
        <FilterBar count={total} noun="requests">
          <FilterField label="Search">
            <Input aria-label="Search member or reference" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Member or reference" className="h-8 w-full sm:w-64" />
          </FilterField>
          <FilterField label="Type">
            <NativeSelect aria-label="Type" value={type} onChange={event => chooseType(event.target.value as ApprovalType | "")} className="h-8">
              <option value="">All types</option>
              {approvalTypes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </NativeSelect>
          </FilterField>
          <FilterField label="Status">
            <NativeSelect aria-label="Status" value={status} onChange={event => { setStatus(event.target.value as ApprovalStatusFilter); setPage(1); }} className="h-8">
              {approvalStatuses.map(value => <option key={value} value={value}>{value === "ALL" ? "All statuses" : statusLabel(value)}</option>)}
            </NativeSelect>
          </FilterField>
        </FilterBar>

        <div className="overflow-x-auto" aria-busy={loading}>
          <Table>
            <TableHeader><TableRow><TableHead>Filed</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead><TableHead>Member</TableHead><TableHead>Documents</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {error && <TableRow><TableCell colSpan={8}><LoadError message={error} onRetry={() => setAttempt(value => value + 1)} /></TableCell></TableRow>}
              {!error && !data?.rows.length && <TableRow><TableCell colSpan={8} className="whitespace-normal">
                <EmptyState>{loading ? "Loading requests…" : source?.message ?? "No requests match these filters."}</EmptyState>
              </TableCell></TableRow>}
              {data?.rows.map(row => <TableRow key={`${row.type}-${row.id}`} className="cursor-pointer" onClick={() => setSelected(row)}>
                <TableCell>{date(row.filedAt)}</TableCell>
                <TableCell>Loan<span className="block text-xs text-muted-foreground">{row.title}</span></TableCell>
                <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                <TableCell className="whitespace-normal">{row.memberName}<span className="block text-xs text-muted-foreground">{row.memberNo ?? row.department ?? ""}</span></TableCell>
                <TableCell>{row.documents ? row.documents.missing.length ? <StatusChip status="PARTIAL" label={`${row.documents.done.length}/${row.documents.required.length}`} /> : <StatusChip status="ACTIVE" label="Complete" /> : "—"}</TableCell>
                <TableCell className="text-right font-mono">{row.amount !== "0.00" ? peso(row.amount) : "—"}</TableCell>
                <TableCell><StatusChip status={row.status} label={row.status === "APPROVED"
                  ? row.released ? "Released" : "For release" : undefined} /></TableCell>
                <TableCell className="text-right">
                  <Button type="button" size="sm" variant="ghost" onClick={event => { event.stopPropagation(); setSelected(row); }}>
                    {row.status === "PENDING" || row.status === "APPROVED" && !row.released ? "Review" : "View"}
                  </Button>
                </TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Page {shownPage}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!data || shownPage <= 1} onClick={() => setPage(shownPage - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={!data?.hasMore} onClick={() => setPage(shownPage + 1)}>Next</Button>
          </div>
        </div>
      </Panel>

      {selected && <ApprovalDialog key={`${selected.type}-${selected.id}`} row={selected}
        onChanged={() => setAttempt(value => value + 1)} onClose={() => setSelected(null)} />}
    </main>
  );
}

function SourceTile({ label, source, active, unavailable, onClick }: {
  label: string; source?: Source; active: boolean; unavailable: boolean; onClick: () => void;
}) {
  const state = unavailable ? "unavailable" : source?.state;
  return <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-lg border bg-card p-3 text-left ${active ? "border-emerald-500" : ""}`}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-mono text-xl font-semibold">{source?.count ?? "—"}</p>
    <p className="text-xs text-muted-foreground">{state === "ready" ? "pending requests" : state === "pending_rollout"
      ? "Pending rollout" : state === "unavailable" ? "Temporarily unavailable" : "Loading…"}</p>
  </button>;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 whitespace-normal rounded-md border border-destructive/40 bg-destructive/5 p-3">
    <p className="text-sm text-destructive">{message}</p>
    <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
  </div>;
}

function ApprovalDialog({ row, onChanged, onClose }: { row: Row; onChanged: () => void; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult<ApprovalDetail>>();
  const [decision, setDecision] = useState<LoanDecisionResult>();
  const path = `/api/fm/cooperative/approvals/${row.type}/${row.id}`;
  const requestKey = `${path}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    const message = "Unable to load this request.";
    loadRequest<ApprovalDetail>(path, controller.signal, message)
      .then(data => { if (!controller.signal.aborted) setResult({ key: requestKey, data }); })
      .catch(cause => { if (!controller.signal.aborted) setResult({ key: requestKey, error: cause instanceof Error ? cause.message : message }); });
    return () => controller.abort();
  }, [path, requestKey]);

  const current = result?.key === requestKey ? result : undefined;
  const detail = current?.data;
  const loan = detail?.detail.loan;
  const release = detail?.detail.release ?? (decision?.journalNo ? decision : null);
  const loanStatus = loan?.status;

  return <ConsoleDialog
    open
    onOpenChange={open => { if (!open) onClose(); }}
    title="Loan request"
    description={`${row.memberName} · ${row.reference}`}
    wide
  >
    {decision && <p role="status" className="rounded-md border p-3 text-sm">
      {decision.status === "ACTIVE" ? `Loan released · ${decision.journalNo}`
        : decision.status === "APPROVED" ? "Loan approved and ready for release." : "Loan rejected."}
    </p>}
    {!current && <p role="status" className="text-sm text-muted-foreground">Loading request…</p>}
    {current?.error && <LoadError message={current.error} onRetry={() => setAttempt(value => value + 1)} />}
    {detail && loan && <Tabs defaultValue="summary">
      <TabsList className="flex h-auto flex-wrap justify-start">
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="summary" className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Principal" value={peso(loan.principal)} />
          <Tile label={loan.productKind === "GOODS" ? "Markup" : "Rate"} value={loan.productKind === "GOODS" ? `${loan.markup}%` : `${loan.rate}% / mo`} />
          <Tile label="Term" value={`${loan.months} mo`} detail={`${loan.frequency === "CUTOFF" ? "Every cutoff" : "Monthly"} · ${loan.mode === "PAYROLL" ? "Salary deduction" : "Over the counter"}`} />
          <Tile label="Balance" value={peso(loan.balance)} detail={loan.pastDue !== "0.00" ? `${peso(loan.pastDue)} past due` : "Current"} alert={loan.pastDue !== "0.00"} />
        </div>
        <Panel title="Request details">
          <Kv rows={[
            ["Loan", loan.loanNo],
            ["Agreement", loan.agreementNo],
            ["Signature", loan.agreementSigned ? "Member signed" : "Awaiting signature"],
            ["Member", `${loan.memberName}${loan.memberNo ? ` · ${loan.memberNo}` : ""}`],
            ["Product", loan.productName],
            ["Filed", date(loan.appliedOn)],
            ["Status", loan.releasedOn ? "Released" : loanStatus === "APPROVED" ? "For release" : statusLabel(loan.status)],
            ...(loan.approvedOn ? [["Approved", date(loan.approvedOn)]] as [string, string][] : []),
            ["Processing fee on release", peso(loan.processingFee)],
            ...(loan.signedPricing ? [
              ["Regular installment", peso(loan.signedPricing.regularPayment)],
              ["Final installment", peso(loan.signedPricing.finalPayment)],
            ] as [string, string][] : []),
            ...(loan.releasedOn && loan.releaseMethod ? [["Payout method", statusLabel(loan.releaseMethod)]] as [string, string][] : []),
            ...(loan.releasedOn && !release ? [["Released", date(loan.releasedOn)]] as [string, string][] : []),
            ["Total payable", peso(loan.totalPayable)],
          ]} />
        </Panel>
        {release && <LoanReleaseDetails release={release} />}
        {(loanStatus === "PENDING" || loanStatus === "APPROVED") && <LoanDecisionPanel
          endpoint={`${path}/decision`}
          onChanged={result => { setDecision(result); setAttempt(value => value + 1); onChanged(); }} />}
      </TabsContent>
      <TabsContent value="documents" className="mt-4 space-y-3">
        {loan.documents.required.length === 0 && <EmptyState>No required documents recorded.</EmptyState>}
        {loan.documents.required.map(document => <div key={document.documentTypeId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
          <span>{document.name}</span>
          <span className="flex items-center gap-2"><Badge variant="outline">{document.enforcement}</Badge><StatusChip status={loan.documents.done.some(item => item.documentTypeId === document.documentTypeId) ? "ACTIVE" : "PARTIAL"} label={loan.documents.done.some(item => item.documentTypeId === document.documentTypeId) ? "On file" : "Missing"} /></span>
        </div>)}
        {detail.detail.documents.length > 0 && <div className="space-y-2"><h3 className="text-sm font-semibold">Files</h3>{detail.detail.documents.map(file => {
          const url = "/api/fm/cooperative/approvals/loan/" + loan.id + "/documents/" + encodeURIComponent(file.id);
          return <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span>{file.fileName} <span className="text-xs text-muted-foreground">{date(file.uploadedAt)}</span></span>
            <span className="flex gap-2">
              <Button asChild size="sm" variant="outline"><a href={url} target="_blank" rel="noreferrer">Open</a></Button>
              <Button asChild size="sm" variant="outline"><a href={url + "?download=1"}>Download</a></Button>
            </span>
          </div>;
        })}</div>}
      </TabsContent>
      <TabsContent value="history" className="mt-4">
        {detail.detail.history.length === 0 ? <EmptyState>No history recorded.</EmptyState> : <ul className="divide-y rounded-md border">
          {detail.detail.history.map((entry, index) => <li key={`${entry.date}-${index}`} className="space-y-1 p-3 text-sm">
            <p>{entry.text}</p>
            <p className="text-xs text-muted-foreground">{date(entry.date)}{entry.actor ? ` · ${entry.actor}` : ""}</p>
          </li>)}
        </ul>}
      </TabsContent>
    </Tabs>}
  </ConsoleDialog>;
}
