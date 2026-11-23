"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { LoanPaymentDialog } from "../../loans/LoanPaymentDialog";
import { MemberApiError, memberFetch, newRequestKey } from "../../members/client";
import { peso } from "../../members/format";
import type { LoanPaymentResult, LoanReversalPreview } from "../../server/loan-payments";
import type { TransactionJournal } from "../../server/transaction-journal";
import { channelLabels, transactionChannels, transactionLabels, transactionTypes } from "../../transactions/entries";
import { SavingsDepositDialog, savingsReceiptUrl } from "../../transactions/SavingsDepositDialog";
import { PayrollRemittanceDialog } from "../../transactions/PayrollRemittanceDialog";
import { StaffWithdrawals } from "../../withdrawals/StaffWithdrawals";
import { ConsoleDialog, EmptyState, FilterBar, FilterField, Kv, Panel, Tile } from "../components/ui";
import { formatDate } from "../format";

const endpoint = "/api/fm/cooperative/transactions/loan-payments";
const journalEndpoint = "/api/fm/cooperative/transactions/journal";
type ReversiblePayment = { id: number; loanId: number; journalNo: string; loanNo: string | null; memberName: string; amount: string; businessDate: string };

export default function TransactionsModule() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [channel, setChannel] = useState("");
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [journal, setJournal] = useState<TransactionJournal>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState(false);
  const [deposit, setDeposit] = useState(false);
  const [remittance, setRemittance] = useState<{ view: "upload" | "history" | "detail"; batchId?: number }>();
  const [reversal, setReversal] = useState<ReversiblePayment>();
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const request = new AbortController();
    const params = new URLSearchParams({ search, type, channel, month, page: String(page) });
    const timer = setTimeout(() => {
      memberFetch<TransactionJournal>(`${journalEndpoint}?${params}`, { signal: request.signal }).then(result => {
        if (!request.signal.aborted) setJournal(result);
      }).catch(cause => {
        if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load the journal.");
      }).finally(() => { if (!request.signal.aborted) setLoading(false); });
    }, 180);
    return () => { clearTimeout(timer); request.abort(); };
  }, [search, type, channel, month, page, attempt]);

  function changePage(next: number) {
    setPage(next);
    setError("");
    setLoading(true);
  }

  function refresh() {
    changePage(1);
    setAttempt(value => value + 1);
  }

  return (
    <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Cooperative</p>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Record money received and review posted activity.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={!journal?.indexed} onClick={() => setDeposit(true)}>Savings deposit</Button>
          <Button size="sm" onClick={() => setPayment(true)}>Loan payment</Button>
          {journal?.indexed && <>
            <Button size="sm" variant="outline" onClick={() => setRemittance({ view: "upload" })}>Payroll remittance</Button>
            <Button size="sm" variant="outline" onClick={() => setRemittance({ view: "history" })}>Batch history</Button>
          </>}
        </div>
      </div>
      {notice && <p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}
      <StaffWithdrawals />
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Money in (filtered)" value={!loading && !error && journal ? peso(journal.moneyIn) : "—"} />
        <Tile label="Money out (filtered)" value={!loading && !error && journal ? peso(journal.moneyOut) : "—"} />
        <Tile label="Net" value={!loading && !error && journal ? peso(journal.net) : "—"} detail={!loading && !error && journal ? `${journal.count} entries` : undefined} />
      </div>

      <Panel title={journal?.indexed === false ? "Loan payment journal" : "Posted journal"}>
        <FilterBar count={loading || error ? undefined : journal?.count} noun="entries">
          <FilterField label="Search"><Input aria-label="Search posted journal" value={search} onChange={event => { setSearch(event.target.value); changePage(1); }} placeholder="Member or reference" className="h-8 w-full sm:w-64" /></FilterField>
          <FilterField label="Type">
            <NativeSelect aria-label="Transaction type" value={type} onChange={event => { setType(event.target.value); changePage(1); }} className="h-8">
              <option value="">All types</option>
              {(journal?.indexed ? [...transactionTypes.slice(0, 7), "SAVINGS_DEPOSIT_REVERSED"] as const : ["LOAN_PAYMENT", "LOAN_PAYMENT_REVERSED"] as const).map(kind =>
                <option key={kind} value={kind}>{transactionLabels[kind]}</option>)}
            </NativeSelect>
          </FilterField>
          <FilterField label="Channel">
            <NativeSelect aria-label="Transaction channel" value={channel} onChange={event => { setChannel(event.target.value); changePage(1); }} className="h-8">
              <option value="">All channels</option>
              {(journal?.indexed ? transactionChannels : transactionChannels.slice(0, 2)).map(value =>
                <option key={value} value={value}>{channelLabels[value]}</option>)}
            </NativeSelect>
          </FilterField>
          <FilterField label="Posting month"><Input aria-label="Posting month" type="month" value={month} onChange={event => { setMonth(event.target.value); changePage(1); }} className="h-8" /></FilterField>
        </FilterBar>

        {error && <div role="alert" className="mb-3 flex items-center gap-3 text-sm text-destructive">
          {error}<Button size="sm" variant="outline" onClick={refresh}>Retry</Button>
        </div>}
        <div className="max-h-[65dvh] overflow-auto rounded-md border">
          <Table aria-busy={loading}>
            <TableHeader><TableRow>
              <TableHead>Posting date</TableHead><TableHead>Member / loan</TableHead><TableHead>Type</TableHead>
              <TableHead>Channel</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={7}><EmptyState>Loading posted transactions…</EmptyState></TableCell></TableRow> :
                !error && !journal?.rows.length && <TableRow><TableCell colSpan={7}><EmptyState>No posted entries match these filters.</EmptyState></TableCell></TableRow>}
              {!loading && !error && journal?.rows.map(row => <TableRow key={row.id}>
                <TableCell>{formatDate(row.businessDate)}{row.receiptDate && row.businessDate !== row.receiptDate &&
                  <span className="block text-xs text-muted-foreground">Received {formatDate(row.receiptDate)}</span>}
                </TableCell>
                <TableCell className="whitespace-normal">{row.memberName}<span className="block font-mono text-xs text-muted-foreground">{row.employeeNo}</span></TableCell>
                <TableCell>{row.reversed ? "Reversed payment" : transactionLabels[row.kind]}</TableCell>
                <TableCell>{channelLabels[row.channel]}</TableCell>
                <TableCell className="font-mono text-xs">
                  {[...new Set([row.orNo, row.sourceReference, row.reference, row.journalNo].filter(Boolean))].map(reference =>
                    <span className="block" key={reference}>{reference}</span>)}
                  {row.originalJournal && <span className="block text-muted-foreground">Reverses {row.originalJournal}</span>}
                </TableCell>
                <TableCell className="text-right font-mono">{peso(row.amount)}</TableCell>
                <TableCell><div className="flex flex-wrap items-center gap-2">
                  {row.depositJournalId && <Button size="sm" variant="outline" asChild>
                    <a href={savingsReceiptUrl(row.depositJournalId)} target="_blank" rel="noreferrer">Print official receipt</a>
                  </Button>}
                  {row.orNo && row.paymentId && row.loanId && <Button size="sm" variant="outline" asChild>
                    <a href={`${endpoint}/${row.loanId}?receipt=${row.paymentId}`} target="_blank" rel="noreferrer">Print receipt</a>
                  </Button>}
                  {row.remittanceBatchId && <Button size="sm" variant="outline"
                    onClick={() => setRemittance({ view: "detail", batchId: row.remittanceBatchId! })}>View remittance</Button>}
                  {row.kind === "LOAN_PAYMENT" && row.paymentId !== null && row.loanId !== null && !row.reversed && !row.remittanceBatchId &&
                    <Button size="sm" variant="outline" onClick={() => {
                      if (row.paymentId && row.loanId) setReversal({ ...row, id: row.paymentId, loanId: row.loanId, loanNo: row.sourceReference });
                    }}>Reverse</Button>}
                </div></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          Page {journal?.page ?? page}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={(journal?.page ?? page) === 1 || loading || !!error} onClick={() => changePage((journal?.page ?? page) - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={!journal?.hasMore || loading || !!error} onClick={() => changePage((journal?.page ?? page) + 1)}>Next</Button>
          </div>
        </div>
      </Panel>

      {payment && <LoanPaymentDialog endpoint={endpoint} onClose={() => setPayment(false)} onPosted={() => { setNotice(""); refresh(); }} />}
      {deposit && <SavingsDepositDialog onClose={() => setDeposit(false)} onPosted={result => {
        setNotice(`Savings deposit posted · ${result.orNo}`);
        refresh();
      }} />}
      {remittance && <PayrollRemittanceDialog initialView={remittance.view} initialBatchId={remittance.batchId}
        onClose={() => setRemittance(undefined)} onChanged={message => { setNotice(message); refresh(); }} />}
      {reversal && <ReversalDialog row={reversal} onClose={() => setReversal(undefined)} onPosted={result => {
        setReversal(undefined);
        setNotice(`Payment reversed · ${result.journalNo}`);
        refresh();
      }} />}
    </main>
  );
}

function ReversalDialog({ row, onClose, onPosted }: {
  row: ReversiblePayment; onClose: () => void; onPosted: (result: LoanPaymentResult) => void;
}) {
  const [review, setReview] = useState<{ preview: LoanReversalPreview; key: string }>();
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (working) return;
    setWorking(true);
    setError("");
    const url = `${endpoint}/${row.loanId}/reversal`;
    const request = (body: Record<string, unknown>) => ({ method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId: row.id, ...body }) });
    try {
      if (review) {
        onPosted(await memberFetch<LoanPaymentResult>(url, request({ action: "post", reason, requestKey: review.key,
          revision: review.preview.revision, fingerprint: review.preview.fingerprint })));
      } else {
        const preview = await memberFetch<LoanReversalPreview>(url, request({ action: "preview" }));
        setReview({ preview, key: newRequestKey() });
      }
    } catch (cause) {
      if (cause instanceof MemberApiError && cause.payload?.code === "STALE_LOAN_REVIEW") setReview(undefined);
      setError(cause instanceof Error ? cause.message : "Unable to reverse the payment.");
    } finally {
      setWorking(false);
    }
  }

  const preview = review?.preview;
  return (
    <ConsoleDialog open onOpenChange={open => { if (!open && !working) onClose(); }} title="Reverse loan payment"
      description={`${row.loanNo} · ${row.memberName} · ${row.journalNo}`}
      footer={<><Button variant="outline" onClick={onClose} disabled={working}>Cancel</Button>
        <Button variant={preview ? "destructive" : "default"} disabled={working || (Boolean(preview) && !reason.trim())}
          onClick={() => void submit()}>{working ? "Please wait…" : preview ? "Confirm reversal" : "Review reversal"}</Button></>}>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Kv rows={[["Original posting date", row.businessDate], ["Amount to reverse", peso(row.amount)],
        ...(preview ? [
          ["Reversal posting date", preview.date] as [string, string], ["Current installment balance", peso(preview.currentBalance)] as [string, string],
          ["Installment balance after reversal", peso(preview.afterBalance)] as [string, string], ["Penalties after reversal", peso(preview.afterPenalties)] as [string, string],
          ["Loan status after reversal", preview.status === "FULLY_PAID" ? "Fully paid" : "Active"] as [string, string],
        ] : [])]} />
      {preview && <>
        <Table>
          <TableHeader><TableRow><TableHead>Affected installment</TableHead><TableHead>Paid after reversal</TableHead><TableHead>Penalty paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{preview.installments.map(item => <TableRow key={item.no}>
            <TableCell>{item.no}</TableCell><TableCell>{peso(item.paid)}</TableCell><TableCell>{peso(item.penaltyPaid)}</TableCell>
            <TableCell className="capitalize">{item.status.toLowerCase()}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <label className="block space-y-1 text-sm">Reversal reason
          <Textarea value={reason} onChange={event => { setReason(event.target.value); setReview({ preview, key: newRequestKey() }); }} maxLength={500} disabled={working} />
        </label>
      </>}
    </ConsoleDialog>
  );
}
