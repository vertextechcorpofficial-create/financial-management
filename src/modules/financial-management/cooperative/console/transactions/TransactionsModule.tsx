"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CheckCircle2, ChevronLeft,
  ChevronRight, Landmark, Receipt, RefreshCw, Scale, Search, SearchX, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { LoanPaymentDialog } from "../../loans/LoanPaymentDialog";
import { memberFetch } from "../../members/client";
import { MetricCard } from "../../members/components";
import { peso } from "../../members/format";
import type { TransactionJournal } from "../../server/transaction-journal";
import type { StaffWithdrawalRequests } from "../../server/withdrawals";
import { channelLabels, transactionChannels, transactionLabels, transactionTypes } from "../../transactions/entries";
import { PayrollRemittanceDialog } from "../../transactions/PayrollRemittanceDialog";
import { ReversalDialog, type ReversiblePayment } from "../../transactions/ReversalDialog";
import { SettlementReversalDialog } from "../../transactions/SettlementReversalDialog";
import { SavingsDepositDialog } from "../../transactions/SavingsDepositDialog";
import { StaffWithdrawals } from "../../withdrawals/StaffWithdrawals";
import { Panel } from "../components/ui";
import { JournalSkeleton, JournalTableRow } from "./components";

const journalEndpoint = "/api/fm/cooperative/transactions/journal";
const loanPaymentEndpoint = "/api/fm/cooperative/transactions/loan-payments";
const withdrawalEndpoint = "/api/fm/cooperative/transactions/withdrawals";
const pageSize = 50;
const tabTriggerClass = "shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:bg-background";

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
  const [settlementReversal, setSettlementReversal] = useState<number>();
  const [notice, setNotice] = useState("");
  const [withdrawalAttempt, setWithdrawalAttempt] = useState(0);
  const [withdrawalPending, setWithdrawalPending] = useState<number | null>(null);

  useEffect(() => {
    const request = new AbortController();
    const params = new URLSearchParams({ search, type, channel, month, page: String(page) });
    const timer = window.setTimeout(() => {
      memberFetch<TransactionJournal>(`${journalEndpoint}?${params}`, { signal: request.signal })
        .then(result => {
          if (request.signal.aborted) return;
          setJournal(result);
          setError("");
        })
        .catch(cause => {
          if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load the journal.");
        })
        .finally(() => { if (!request.signal.aborted) setLoading(false); });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      request.abort();
    };
  }, [search, type, channel, month, page, attempt]);

  useEffect(() => {
    const request = new AbortController();
    memberFetch<StaffWithdrawalRequests>(`${withdrawalEndpoint}?status=PENDING&page=1`, { signal: request.signal })
      .then(result => {
        if (!request.signal.aborted) setWithdrawalPending(result.state === "ready" ? result.total : null);
      })
      .catch(() => { if (!request.signal.aborted) setWithdrawalPending(null); });
    return () => request.abort();
  }, [withdrawalAttempt]);

  useEffect(() => {
    const refreshOnFocus = () => {
      setLoading(true);
      setAttempt(value => value + 1);
      setWithdrawalAttempt(value => value + 1);
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
    setLoading(true);
    setError("");
  }

  function changePage(next: number) {
    setPage(next);
    setLoading(true);
    setError("");
  }

  function clearFilters() {
    setSearch("");
    setType("");
    setChannel("");
    setMonth("");
    setPage(1);
    setLoading(true);
    setError("");
  }

  function refresh() {
    changePage(1);
    setAttempt(value => value + 1);
    setWithdrawalAttempt(value => value + 1);
  }

  function openReversal(row: TransactionJournal["rows"][number]) {
    if (row.paymentId === null || row.loanId === null) return;
    setReversal({
      id: row.paymentId,
      loanId: row.loanId,
      journalNo: row.journalNo,
      loanNo: row.sourceReference,
      memberName: row.memberName,
      amount: row.amount,
      businessDate: row.businessDate,
    });
  }

  const indexed = journal?.indexed === true;
  const legacy = journal?.indexed === false;
  const shownPage = journal?.page ?? page;
  const from = journal && journal.count > 0 ? (shownPage - 1) * pageSize + 1 : 0;
  const to = journal ? Math.min((shownPage - 1) * pageSize + journal.rows.length, journal.count) : 0;
  const hasFilters = Boolean(search.trim() || type || channel || month);
  const typeOptions = journal?.indexed === false
    ? ["LOAN_PAYMENT", "LOAN_PAYMENT_REVERSED"] as const
    : [...transactionTypes.slice(0, 7), "SAVINGS_DEPOSIT_REVERSED"] as const;
  const channelOptions = journal?.indexed === false ? transactionChannels.slice(0, 2) : transactionChannels;
  const valuesAvailable = Boolean(journal) && !loading && !error;

  return (
    <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-emerald-500/5 blur-2xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <ArrowLeftRight className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cooperative</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Transactions</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Record money in and out, manage payroll remittances, and review the Cooperative journal.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-auto lg:shrink-0">
            <Button
              className="w-full sm:w-auto"
              disabled={!journal?.indexed}
              title={journal && !journal.indexed ? "Savings deposits require the transaction index." : undefined}
              onClick={() => setDeposit(true)}
            >
              Savings deposit
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setPayment(true)}>Loan payment</Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh
            </Button>
          </div>
        </div>
      </section>

      {notice && (
        <div role="status" className="flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0 flex-1">{notice}</p>
          <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => setNotice("")} aria-label="Dismiss notice">
            <X className="size-4" />
          </Button>
        </div>
      )}

      {legacy && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>The transaction index is unavailable. Showing loan payments only; savings deposits are disabled.</p>
        </div>
      )}

      <Tabs defaultValue="journal" className="space-y-4">
        <TabsList className="flex h-auto w-full max-w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
          <TabsTrigger value="journal" className={tabTriggerClass}><Receipt className="size-3.5" /> Posted journal</TabsTrigger>
          <TabsTrigger value="withdrawals" className={tabTriggerClass}>
            <Landmark className="size-3.5" /> Withdrawal requests
            {withdrawalPending !== null && <Badge variant="outline" className="ml-1">{withdrawalPending}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="journal" className="mt-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              icon={ArrowDownLeft}
              label={legacy ? "Payments received" : "Money in"}
              value={valuesAvailable && journal ? peso(journal.moneyIn) : "—"}
              detail={legacy ? "Filtered loan payments" : "Filtered incoming"}
              tone="emerald"
            />
            <MetricCard
              icon={ArrowUpRight}
              label={legacy ? "Reversals" : "Money out"}
              value={valuesAvailable && journal ? peso(journal.moneyOut) : "—"}
              detail={legacy ? "Filtered reversals" : "Filtered outgoing"}
              tone="rose"
            />
            <MetricCard
              icon={Scale}
              label={legacy ? "Net payments" : "Net"}
              value={valuesAvailable && journal ? peso(journal.net) : "—"}
              detail={valuesAvailable && journal ? `${journal.count} entries` : "In minus out"}
              tone={journal?.net.startsWith("-") ? "rose" : "emerald"}
            />
          </div>

          <Panel
            title={legacy ? "Loan payment journal" : "Posted journal"}
            description={legacy
              ? "Posted loan repayments and reversals."
              : "Every posted Cooperative transaction, filtered by the controls below."}
            actions={indexed ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setRemittance({ view: "upload" })}>Payroll remittance</Button>
                <Button size="sm" variant="ghost" onClick={() => setRemittance({ view: "history" })}>Batch history</Button>
              </div>
            ) : undefined}
          >
            <div className="mb-4 rounded-xl border bg-muted/20 p-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground sm:col-span-2 xl:col-span-3">
                  Search
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label="Search posted journal"
                      value={search}
                      onChange={event => changeFilter(setSearch, event.target.value)}
                      placeholder="Member, reference, receipt, or journal"
                      className="h-9 pl-8"
                    />
                  </div>
                </label>
                <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
                  Type
                  <NativeSelect aria-label="Transaction type" value={type} onChange={event => changeFilter(setType, event.target.value)} className="h-9 w-full">
                    <option value="">All types</option>
                    {typeOptions.map(kind => <option key={kind} value={kind}>{transactionLabels[kind]}</option>)}
                  </NativeSelect>
                </label>
                <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
                  Channel
                  <NativeSelect aria-label="Transaction channel" value={channel} onChange={event => changeFilter(setChannel, event.target.value)} className="h-9 w-full">
                    <option value="">All channels</option>
                    {channelOptions.map(value => <option key={value} value={value}>{channelLabels[value]}</option>)}
                  </NativeSelect>
                </label>
                <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
                  Posting month
                  <Input aria-label="Posting month" type="month" value={month} onChange={event => changeFilter(setMonth, event.target.value)} className="h-9 w-full" />
                </label>
                <div className="flex items-end justify-between gap-2 sm:col-span-2 xl:col-span-3">
                  <p className="text-xs text-muted-foreground">
                    {loading ? "Updating journal..." : `${journal?.count ?? 0} entr${journal?.count === 1 ? "y" : "ies"} match`}
                  </p>
                  {hasFilters && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearFilters}>
                      <X className="size-3.5" /> Clear filters
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                <AlertTriangle className="size-4 shrink-0 text-destructive" />
                <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
                <Button size="sm" variant="outline" onClick={refresh}>Retry</Button>
              </div>
            )}

            <div className="max-h-[65dvh] overflow-auto rounded-lg border">
              <Table className="min-w-full sm:min-w-[620px]" aria-busy={loading}>
                <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="hidden md:table-cell">Posting date</TableHead>
                    <TableHead className="hidden sm:table-cell">Member</TableHead>
                    <TableHead className="hidden lg:table-cell">Type</TableHead>
                    <TableHead className="hidden lg:table-cell">Channel</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody className={cn("transition-opacity", loading && journal && "opacity-60")}>
                  {loading && !journal && <JournalSkeleton />}
                  {!loading && !error && journal?.rows.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7}>
                        <div className="flex flex-col items-center gap-2 py-10 text-center">
                          <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><SearchX className="size-5" /></span>
                          <p className="text-sm font-medium">No transactions match these filters</p>
                          <p className="max-w-sm text-xs text-muted-foreground">
                            {hasFilters ? "Try a different search, type, channel, or posting month." : "No transactions have been posted yet."}
                          </p>
                          {hasFilters && <Button type="button" variant="outline" size="sm" className="mt-1" onClick={clearFilters}>Clear filters</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {!error && journal?.rows.map(row => (
                    <JournalTableRow
                      key={row.id}
                      row={row}
                      paymentEndpoint={loanPaymentEndpoint}
                      onRemittance={batchId => setRemittance({ view: "detail", batchId })}
                      onReverse={openReversal}
                      onSettlement={setSettlementReversal}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
              <span>
                {journal && journal.count > 0
                  ? <>Showing <span className="font-medium text-foreground">{from}-{to}</span> of <span className="font-medium text-foreground">{journal.count}</span></>
                  : journal ? "No records" : "Loading..."}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={shownPage <= 1 || loading || Boolean(error)} onClick={() => changePage(shownPage - 1)}>
                  <ChevronLeft className="size-3.5" /> Previous
                </Button>
                <span className="min-w-14 text-center font-medium text-foreground">Page {shownPage}</span>
                <Button size="sm" variant="outline" disabled={!journal?.hasMore || loading || Boolean(error)} onClick={() => changePage(shownPage + 1)}>
                  Next <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="withdrawals" className="mt-0">
          <StaffWithdrawals onQueueChanged={() => setWithdrawalAttempt(value => value + 1)} />
        </TabsContent>
      </Tabs>

      {payment && <LoanPaymentDialog endpoint={loanPaymentEndpoint} onClose={() => setPayment(false)} onPosted={() => {
        setNotice("");
        refresh();
      }} />}
      {deposit && <SavingsDepositDialog onClose={() => setDeposit(false)} onPosted={result => {
        setNotice(`Savings deposit posted · ${result.orNo}`);
        refresh();
      }} />}
      {remittance && <PayrollRemittanceDialog initialView={remittance.view} initialBatchId={remittance.batchId}
        onClose={() => setRemittance(undefined)} onChanged={message => { setNotice(message); refresh(); }} />}
      {reversal && <ReversalDialog row={reversal} endpoint={loanPaymentEndpoint} onClose={() => setReversal(undefined)} onPosted={result => {
        setReversal(undefined);
        setNotice(`Payment reversed · ${result.journalNo}`);
        refresh();
      }} />}
      {settlementReversal !== undefined && <SettlementReversalDialog id={settlementReversal} onClose={() => setSettlementReversal(undefined)}
        onPosted={reference => {
          setSettlementReversal(undefined);
          setNotice(`${reference} settlement reversed.`);
          refresh();
        }} />}
    </main>
  );
}
