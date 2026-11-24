"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Receipt, Search, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConsoleDialog, Kv, Panel } from "../console/components/ui";
import { MetricCard } from "../members/components";
import { fieldErrorsFrom, MemberApiError, memberFetch, newRequestKey } from "../members/client";
import { date, peso } from "../members/format";
import type { PayableLoans } from "../server/loan-payment-register";
import type { LoanPaymentPreview, LoanPaymentResult, LoanPaymentSummary } from "../server/loan-payments";
import { PayrollRunSelect } from "../transactions/PayrollRunSelect";

export function LoanPaymentDialog({ endpoint, loanId, onClose, onPosted }: {
  endpoint: string;
  loanId?: number;
  onClose: () => void;
  onPosted: (result: LoanPaymentResult) => void;
}) {
  const [selected, setSelected] = useState(loanId);
  const [summary, setSummary] = useState<LoanPaymentSummary>();
  const [amount, setAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [channel, setChannel] = useState<"OTC" | "PAYROLL">("OTC");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [payrollRunId, setPayrollRunId] = useState<number>();
  const [deductionReference, setDeductionReference] = useState("");
  const [review, setReview] = useState<{ preview: LoanPaymentPreview; key: string }>();
  const [result, setResult] = useState<LoanPaymentResult>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  const paymentUrl = selected ? (loanId ? endpoint : `${endpoint}/${selected}`) : "";

  useEffect(() => {
    if (!paymentUrl) return;
    const request = new AbortController();
    memberFetch<LoanPaymentSummary>(paymentUrl, { signal: request.signal }).then(data => {
      if (request.signal.aborted) return;
      setSummary(data);
      setReceiptDate(data.today);
      setAmount(Number(data.due) > 0 ? data.due : "");
      setChannel(data.channel);
      setReference("");
      setConfirmed(false);
      setPayrollRunId(undefined);
      setDeductionReference("");
    }).catch(cause => {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load the loan balance.");
    });
    return () => request.abort();
  }, [paymentUrl, retry]);

  function resetReview() {
    setReview(undefined);
    setFields({});
    setError("");
  }

  function pick(id?: number) {
    setSelected(id);
    setSummary(undefined);
    resetReview();
  }

  async function submit() {
    if (working || !summary || !paymentUrl) return;
    setWorking(true);
    setError("");
    setFields({});
    const input = { amount, receiptDate, channel, reference, confirmed, payrollRunId, deductionReference };
    const request = (body: Record<string, unknown>) => ({
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, ...body }),
    });
    try {
      if (review) {
        const posted = await memberFetch<LoanPaymentResult>(paymentUrl, request({ action: "post", requestKey: review.key,
          revision: review.preview.revision, fingerprint: review.preview.fingerprint }));
        setResult(posted);
        onPosted(posted);
      } else {
        const preview = await memberFetch<LoanPaymentPreview>(paymentUrl, request({ action: "preview" }));
        setReview({ preview, key: newRequestKey() });
      }
    } catch (cause) {
      if (cause instanceof MemberApiError && ["STALE_LOAN_REVIEW", "LOAN_DUE_UPDATED", "STALE_REMITTANCE"].includes(cause.payload?.code ?? "")) {
        setReview(undefined);
        try {
          const preview = await memberFetch<LoanPaymentPreview>(paymentUrl, request({ action: "preview" }));
          setReview({ preview, key: newRequestKey() });
        } catch (refreshError) {
          setFields(fieldErrorsFrom(refreshError));
          setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh the payment review.");
          return;
        }
      }
      setFields(fieldErrorsFrom(cause));
      setError(cause instanceof Error ? cause.message : "Unable to save the payment. Try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open && !working) onClose(); }}
      wide
      title={result ? "Payment posted" : review ? "Review loan payment" : "Loan payment"}
      description={summary ? `${summary.loanNo} · ${summary.memberName}` : "Choose a released loan with a balance."}
      footerClassName="sticky bottom-0 z-20 -mx-6 -mb-6 mt-4 border-t bg-background/95 px-6 py-3 backdrop-blur"
      footer={result ? (
        <>
          {result.orNo && (
            <Button asChild variant="outline">
              <a href={`${paymentUrl}?receipt=${result.paymentId}`} target="_blank" rel="noreferrer">
                <Receipt className="size-4" /> Print official receipt
              </a>
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </>
      ) : (
        <>
          <Button variant="outline" disabled={working} onClick={review ? resetReview : onClose}>
            {review ? "Edit payment" : "Cancel"}
          </Button>
          <Button
            disabled={working || !summary || !amount || !receiptDate || (channel === "PAYROLL" && (!confirmed || !reference.trim() || !payrollRunId))}
            onClick={() => void submit()}
          >
            {working && <Loader2 className="size-4 animate-spin" />}
            {working ? "Please wait..." : review ? "Confirm payment" : "Review payment"}
          </Button>
        </>
      )}
    >
      {error && (
        <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      {result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">Payment saved</p>
              <p className="mt-0.5 text-xs">{summary ? `${summary.loanNo} · ${summary.memberName}` : "The loan ledger has been updated."}</p>
            </div>
          </div>
          <Panel title="Posting result">
            <Kv rows={[
              ["Journal", result.journalNo],
              ...(result.orNo ? [["Official receipt", result.orNo] as [string, string]] : []),
              ["Posted on", result.businessDate], ["Paid", peso(result.amount)],
              ["Remaining installments", peso(result.balance)], ["Remaining penalties", peso(result.penalties)],
              ["Loan status", result.status === "FULLY_PAID" ? "Fully paid" : "Active"],
            ]} />
          </Panel>
        </div>
      ) : review ? (
        <PaymentReview preview={review.preview} />
      ) : (
        <div className="space-y-4">
          {!loanId && (
            <Panel title="Find an active loan" description="Search by loan number, member, or member number.">
              <LoanPicker endpoint={endpoint} id={selected} onPick={pick} disabled={working} />
            </Panel>
          )}
          {paymentUrl && !summary && (
            error
              ? <Button variant="outline" size="sm" onClick={() => { setError(""); setRetry(value => value + 1); }}>Retry balance</Button>
              : <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading payment balance...
              </p>
          )}
          {summary && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard icon={Wallet} label="Due today" value={peso(summary.due)} detail="Installments due to date" tone="emerald" />
                <MetricCard icon={AlertTriangle} label="Penalties due" value={peso(summary.penalties)} detail="Posted late-payment penalties" tone="amber" />
                <MetricCard icon={Receipt} label="Full payoff" value={peso(summary.maximum)} detail="All remaining installments" tone="sky" />
              </div>
              <Panel title="Payment details" description={`Released ${date(summary.releasedOn)} · ${summary.channel === "PAYROLL" ? "Payroll account" : "Over the counter"}`}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3">
                    <label className="block space-y-1 text-sm">Amount (PHP)
                      <Input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" disabled={working} aria-invalid={Boolean(fields.amount)} />
                    </label>
                    {fields.amount && <p className="text-xs text-destructive">{fields.amount}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={working || Number(summary.due) <= 0} onClick={() => setAmount(summary.due)}>Amount due</Button>
                      <Button size="sm" variant="outline" disabled={working} onClick={() => setAmount(summary.maximum)}>Full payoff</Button>
                    </div>
                    <label className="block space-y-1 text-sm">Receipt date
                      <Input type="date" min={summary.releasedOn} max={summary.today} value={receiptDate} disabled={working}
                        onChange={event => setReceiptDate(event.target.value)} aria-invalid={Boolean(fields.receiptDate)} />
                    </label>
                    {fields.receiptDate && <p className="text-xs text-destructive">{fields.receiptDate}</p>}
                  </div>
                  <div className="space-y-3">
                    <label className="block space-y-1 text-sm">Received through
                      <NativeSelect value={channel} className="w-full" disabled={working} onChange={event => {
                        setChannel(event.target.value as "OTC" | "PAYROLL"); setConfirmed(false);
                      }}>
                        <option value="OTC">Over the counter</option><option value="PAYROLL">Payroll remittance</option>
                      </NativeSelect>
                    </label>
                    <label className="block space-y-1 text-sm">
                      {channel === "PAYROLL" ? "Bank remittance reference" : "Reference (optional)"}
                      <Input value={reference} onChange={event => setReference(event.target.value)} maxLength={channel === "PAYROLL" ? 80 : 120}
                        disabled={working} aria-invalid={Boolean(fields.reference || fields.bankReference)} />
                    </label>
                    {(fields.reference || fields.bankReference) && <p className="text-xs text-destructive">{fields.reference || fields.bankReference}</p>}
                    {channel === "PAYROLL" && <>
                      <PayrollRunSelect endpoint={paymentUrl} value={payrollRunId} disabled={working} onChange={value => {
                        setPayrollRunId(value); setConfirmed(false);
                      }} />
                      <label className="block space-y-1 text-sm">Payroll deduction reference (optional)
                        <Input value={deductionReference} maxLength={120} disabled={working}
                          placeholder="Required if this run has multiple deductions for the loan"
                          onChange={event => setDeductionReference(event.target.value)} />
                      </label>
                      <label className="flex items-start gap-2 rounded-lg border bg-muted/20 p-2.5 text-sm">
                        <input type="checkbox" className="mt-1" checked={confirmed} disabled={working} onChange={event => setConfirmed(event.target.checked)} />
                        I confirm the payroll remittance was received in the bank.
                      </label>
                    </>}
                  </div>
                </div>
              </Panel>
            </>
          )}
        </div>
      )}
    </ConsoleDialog>
  );
}

function LoanPicker({ endpoint, id, onPick, disabled }: {
  endpoint: string; id?: number; onPick: (id?: number) => void; disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PayableLoans>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  useEffect(() => {
    const request = new AbortController();
    const params = new URLSearchParams({ select: "loans", search, page: String(page) });
    const timer = setTimeout(() => {
      memberFetch<PayableLoans>(`${endpoint}?${params}`, { signal: request.signal }).then(result => {
        if (!request.signal.aborted) setData(result);
      }).catch(cause => {
        if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to find loans.");
      }).finally(() => { if (!request.signal.aborted) setLoading(false); });
    }, 180);
    return () => { clearTimeout(timer); request.abort(); };
  }, [endpoint, page, search]);

  function changePage(next: number) {
    setPage(next);
    setLoading(true);
    setError("");
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-sm">Find an active loan
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={event => { setSearch(event.target.value); changePage(1); }} placeholder="Loan number, member or member number" disabled={disabled} className="pl-8" />
        </div>
      </label>
      <label className="block space-y-1 text-sm">Loan
        <NativeSelect className="w-full" value={id ?? ""} disabled={disabled || loading} onChange={event => {
          const item = data?.rows.find(row => row.id === Number(event.target.value));
          setLabel(item ? `${item.loanNo} · ${item.memberName}` : "");
          onPick(item?.id);
        }}>
          <option value="">{loading ? "Loading active loans..." : data?.rows.length ? "Select loan" : "No matching active loans"}</option>
          {id && !data?.rows.some(row => row.id === id) && <option value={id}>{label}</option>}
          {data?.rows.map(row => <option key={row.id} value={row.id}>{row.loanNo} · {row.memberName}</option>)}
        </NativeSelect>
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {(page > 1 || data?.hasMore) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Button size="sm" variant="outline" disabled={page <= 1 || loading || disabled} onClick={() => changePage(page - 1)}>
            <ChevronLeft className="size-3.5" /> Previous
          </Button>
          <span className="min-w-12 text-center">Page {page}</span>
          <Button size="sm" variant="outline" disabled={!data?.hasMore || loading || disabled} onClick={() => changePage(page + 1)}>
            Next <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function PaymentReview({ preview }: { preview: LoanPaymentPreview }) {
  return (
    <div className="space-y-4">
      <Panel title="Payment review">
        <Kv rows={[
          ["Receipt date", preview.receiptDate], ["Posting date", preview.businessDate],
          ["Allocation order", preview.order === "PENALTIES_FIRST" ? "Penalties first" : "Installments first"],
          ["Amount received", peso(preview.amount)], ["Remaining installments", peso(preview.afterBalance)],
          ["Remaining penalties", peso(preview.afterPenalties)], ["Loan status after payment", preview.status === "FULLY_PAID" ? "Fully paid" : "Active"],
        ]} />
      </Panel>
      {preview.needsDueUpdate && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Confirm to bring the due-date records up to date, then review the refreshed allocation.</p>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <Table className="min-w-[560px]">
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead>Installment</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Interest or markup</TableHead>
              <TableHead className="text-right">Penalty</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.allocations.map(item => (
              <TableRow key={item.installmentNo} className="hover:bg-muted/30">
                <TableCell>{item.installmentNo}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{peso(item.principal)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{peso(item.interest)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{peso(item.penalty)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{peso(item.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
