"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { LoanDecisionResult } from "../server/loan-decisions";

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
type SourceState = "ready" | "pending_rollout" | "unavailable";
type Source = {
  type: "membership" | "loan" | "withdrawal";
  label: string;
  state: SourceState;
  message: string | null;
  count: number | null;
};
type Documents = {
  required: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
  done: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
  missing: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
  warnings: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
  blocks: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
};
type Row = {
  type: "loan" | "membership" | "withdrawal";
  id: number;
  reference: string;
  title: string;
  memberId: number;
  memberNo: string | null;
  memberName: string;
  department: string | null;
  amount: string;
  filedAt: string | null;
  status: ApprovalStatus;
  released: boolean;
  releasedOn: string | null;
  releaseMethod: string | null;
  documents: Documents | null;
};
type Queue = {
  sources: Source[];
  tiles: Record<"membership" | "loan" | "withdrawal", Source>;
  rows: Row[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  filterOptions: {
    types: Array<{ value: string; label: string }>;
    statuses: string[];
  };
};
type Detail = {
  type: "loan";
  sourceState: "ready";
  detail: {
    loan: {
      id: number; loanNo: string; agreementNo: string; memberNo: string | null; memberName: string;
      department: string | null; productName: string; productKind: "CASH" | "GOODS";
      itemName: string | null; itemQuantity: number; principal: string; rate: string; markup: string;
      method: string; months: number; frequency: "CUTOFF" | "MONTHLY"; mode: "PAYROLL" | "OTC";
      purpose: string | null; status: string; releaseMethod: string | null; processingFee: string;
      penaltyPercent: string; graceDays: number; totalPayable: string; appliedOn: string | null;
      approvedOn: string | null; releasedOn: string | null; balance: string; pastDue: string;
      penalties: string; paidCount: number; installmentCount: number; documents: Documents;
      agreementSigned: boolean;
      signedPricing: { paymentCount: number; regularPayment: string; finalPayment: string } | null;
    };
    installments: Array<{ no: number; dueDate: string; principal: string; interest: string; total: string; paidTotal: string; status: string }>;
    payments: Array<{ id: number; officialReceiptNo: string | null; referenceNo: string | null; amount: string; channel: string; receiptDate: string | null }>;
    documents: Array<{ id: string; documentTypeId: number; fileName: string; uploadedAt: string | null }>;
    history: Array<{ date: string; text: string; actor: string | null }>;
    release?: LoanDecisionResult | null;
  };
};

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

export default function ApprovalsModule() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState<ApprovalStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Queue>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), status });
    if (search.trim()) params.set("search", search.trim());
    if (type) params.set("type", type);
    return params.toString();
  }, [page, search, status, type]);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/fm/cooperative/approvals?${query}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) throw new Error(payload?.message || "Unable to load the approval queue.");
      if (!signal.aborted) setData(payload as Queue);
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load the approval queue.");
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

  function chooseType(value: string) {
    setType(value);
    setPage(1);
  }

  const sourceState = data?.sources.find(source => source.type === type) ?? null;
  const visibleSources = data?.sources.filter(source => source.state !== "ready") ?? [];

  return (
    <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Cooperative</p>
          <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Membership, loan, and withdrawal requests in one live queue. Decision actions are enabled as each source and shared posting service passes QA.
          </p>
        </div>
        <Badge variant="outline">Live queue</Badge>
      </div>

      {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
      </div>}

      {data && <div className="grid gap-3 sm:grid-cols-3">
        <SourceTile source={data.tiles.membership} active={type === "membership"} onClick={() => chooseType(type === "membership" ? "" : "membership")} />
        <SourceTile source={data.tiles.loan} active={type === "loan"} onClick={() => chooseType(type === "loan" ? "" : "loan")} />
        <SourceTile source={data.tiles.withdrawal} active={type === "withdrawal"} onClick={() => chooseType(type === "withdrawal" ? "" : "withdrawal")} />
      </div>}

      {visibleSources.map(source => <div key={source.type} role="status" className="rounded-md border border-amber-300/60 bg-amber-50/50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
        <span className="font-semibold">{source.label}: </span>
        {source.message}
      </div>)}

      <Panel title="Request queue" description="Open a request to review its details, document status, and history.">
        <FilterBar count={data?.total ?? 0} noun="requests">
          <FilterField label="Search">
            <Input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Member or reference" className="h-8 w-64" />
          </FilterField>
          <FilterField label="Type">
            <NativeSelect value={type} onChange={event => chooseType(event.target.value)} className="h-8">
              <option value="">All types</option>
              {data?.filterOptions.types.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </NativeSelect>
          </FilterField>
          <FilterField label="Status">
            <NativeSelect value={status} onChange={event => { setStatus(event.target.value as ApprovalStatus); setPage(1); }} className="h-8">
              {data?.filterOptions.statuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}
            </NativeSelect>
          </FilterField>
        </FilterBar>

        {sourceState && sourceState.state !== "ready" && <EmptyState>{sourceState.message}</EmptyState>}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Filed</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead><TableHead>Member</TableHead><TableHead>Documents</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {loading && !data && <TableRow><TableCell colSpan={8}><EmptyState>Loading requests…</EmptyState></TableCell></TableRow>}
              {!loading && data?.rows.length === 0 && <TableRow><TableCell colSpan={8}><EmptyState>{sourceState && sourceState.state !== "ready" ? sourceState.message : "No requests match these filters."}</EmptyState></TableCell></TableRow>}
              {data?.rows.map(row => <TableRow key={`${row.type}-${row.id}`} className="cursor-pointer" onClick={() => setSelected(row)}>
                <TableCell>{date(row.filedAt)}</TableCell>
                <TableCell>{row.type === "loan" ? "Loan" : row.type === "membership" ? "Membership" : "Withdrawal"}<span className="block text-xs text-muted-foreground">{row.title}</span></TableCell>
                <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                <TableCell className="whitespace-normal">{row.memberName}<span className="block text-xs text-muted-foreground">{row.memberNo ?? row.department ?? ""}</span></TableCell>
                <TableCell>{row.documents ? row.documents.missing.length ? <StatusChip status="PARTIAL" label={`${row.documents.done.length}/${row.documents.required.length}`} /> : <StatusChip status="ACTIVE" label="Complete" /> : "—"}</TableCell>
                <TableCell className="text-right font-mono">{row.amount !== "0.00" ? peso(row.amount) : "—"}</TableCell>
                <TableCell><StatusChip status={row.status} label={row.type === "loan" && row.status === "APPROVED"
                  ? row.released ? "Released" : "For release" : undefined} /></TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">Review →</TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Page {data?.page ?? page}{data ? ` · ${data.total} requests` : ""}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={!data?.hasMore || loading} onClick={() => setPage(value => value + 1)}>Next</Button>
          </div>
        </div>
      </Panel>

      {selected && <ApprovalDialog key={`${selected.type}-${selected.id}`} row={selected}
        onChanged={() => setAttempt(value => value + 1)} onClose={() => setSelected(null)} />}
    </main>
  );
}

function SourceTile({ source, active, onClick }: { source: Source; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-lg border bg-card p-3 text-left ${active ? "border-emerald-500" : ""}`}>
    <p className="text-xs text-muted-foreground">{source.label}</p>
    <p className="font-mono text-xl font-semibold">{source.count === null ? "—" : source.count}</p>
    <p className="text-xs text-muted-foreground">{source.state === "ready" ? (source.type === "loan" ? "pending decisions" : "pending requests") : source.state === "pending_rollout" ? "Pending rollout" : "Temporarily unavailable"}</p>
  </button>;
}

function ApprovalDialog({ row, onChanged, onClose }: { row: Row; onChanged: () => void; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [decision, setDecision] = useState<LoanDecisionResult>();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/fm/cooperative/approvals/${row.type}/${row.id}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) throw new Error(payload?.message || "Unable to load this request.");
        return payload as Detail;
      })
      .then(payload => { if (!controller.signal.aborted) setDetail(payload); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load this request."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [row, attempt]);

  const loan = detail?.detail.loan;
  const loanStatus = decision?.status ?? loan?.status;

  return <ConsoleDialog
    open
    onOpenChange={open => { if (!open) onClose(); }}
    title={`${row.type === "loan" ? "Loan" : row.type === "membership" ? "Membership" : "Withdrawal"} request`}
    description={`${row.memberName} · ${row.reference}`}
    wide
  >
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading request…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
            ["Status", loanStatus === "APPROVED" ? "For release" : statusLabel(loanStatus ?? loan.status)],
            ["Processing fee on release", peso(loan.processingFee)],
            ...(loan.signedPricing ? [
              ["Regular installment", peso(loan.signedPricing.regularPayment)],
              ["Final installment", peso(loan.signedPricing.finalPayment)],
            ] as [string, string][] : []),
            ["Released", loan.releasedOn ? `${date(loan.releasedOn)}${loan.releaseMethod ? ` · ${loan.releaseMethod}` : ""}` : "Not released"],
            ["Total payable", peso(loan.totalPayable)],
          ]} />
        </Panel>
        {decision && <p role="status" className="rounded-md border p-3 text-sm">
          {decision.status === "ACTIVE" ? `Loan released · ${decision.journalNo}`
            : decision.status === "APPROVED" ? "Loan approved and ready for release." : "Loan rejected."}
        </p>}
        {(detail.detail.release ?? (decision?.journalNo ? decision : null)) && <LoanReleaseDetails release={(detail.detail.release ?? decision)!} />}
        {(loanStatus === "PENDING" || loanStatus === "APPROVED") && <LoanDecisionPanel key={attempt}
          endpoint={`/api/fm/cooperative/approvals/loan/${loan.id}/decision`}
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
        {detail.detail.history.length === 0 ? <EmptyState>No history recorded.</EmptyState> : <ul className="space-y-1 text-sm text-muted-foreground">{detail.detail.history.map((entry, index) => <li key={`${entry.date}-${index}`}>{date(entry.date)}: {entry.text}{entry.actor ? ` · ${entry.actor}` : ""}</li>)}</ul>}
      </TabsContent>
    </Tabs>}
  </ConsoleDialog>;
}
