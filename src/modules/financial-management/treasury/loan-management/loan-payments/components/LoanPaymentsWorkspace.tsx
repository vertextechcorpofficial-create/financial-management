"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Landmark, Receipt, Scale, Wallet } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber } from "@/lib/utils";

import { ACCENT, LOAN_STATUS_LABEL, LOAN_STATUS_TONE, type InstallmentFilter } from "../constants";
import { useLoanHistory } from "../hooks/useLoanHistory";
import { fetchPaymentContext } from "../providers/paymentsApi";
import { mdy, phtDate } from "../pht";
import type { PaymentContext } from "../types";
import { InstallmentsCard } from "./InstallmentsCard";
import { Notice } from "./Notice";
import { PaymentDetailDialog } from "./PaymentDetailDialog";
import { PaymentHistoryCard } from "./PaymentHistoryCard";
import { RecordPaymentDialog, type PaymentDialogLoan } from "./RecordPaymentDialog";
import { StatusBadge } from "./StatusBadge";

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

interface Props {
  loanId: number;
  onBack: () => void;
}

/** Level 2: one loan. What is due, which installments are open, and every peso already received. */
export function LoanPaymentsWorkspace({ loanId, onBack }: Props) {
  const [context, setContext] = useState<PaymentContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InstallmentFilter>("ALL");
  const [selected, setSelected] = useState<number[]>([]);
  const [dialog, setDialog] = useState<{ amount: number | null; kind: "NORMAL" | "CATCH_UP" } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const history = useLoanHistory(loanId);

  const loadContext = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await fetchPaymentContext(loanId);
      setContext(payload);
      setError(null);
    } catch (caught) {
      setContext(null);
      setError(caught instanceof Error ? caught.message : "The loan could not be read.");
    } finally {
      setIsLoading(false);
    }
  }, [loanId]);

  useEffect(() => {
    setSelected([]);
    setFilter("ALL");
    void loadContext();
  }, [loadContext]);

  const installments = useMemo(() => context?.installments ?? [], [context]);
  const today = phtDate();

  const figures = useMemo(() => {
    const open = installments.filter((item) => item.totalOutstanding > 0);
    const dueToday = open.filter((item) => item.paymentDueDate <= today);
    const overdue = open.filter((item) => item.overdue);
    const next = open[0] ?? null;
    return {
      amountDueNow: round2(dueToday.reduce((total, item) => total + item.totalOutstanding, 0)),
      overdueCount: overdue.length,
      overdueAmount: round2(overdue.reduce((total, item) => total + item.totalOutstanding, 0)),
      next,
      pastTotal: round2(dueToday.reduce((total, item) => total + item.totalOutstanding, 0)),
      pastCount: dueToday.length,
    };
  }, [installments, today]);

  const dialogLoan: PaymentDialogLoan | null = context
    ? {
        id: context.loan.id,
        loanNo: context.loan.loan_no,
        lenderName: context.loan.lender_name,
        installmentAmount: context.loan.installment_amount,
      }
    : null;

  function afterRecorded() {
    setSelected([]);
    void loadContext();
    void history.reload();
  }

  function toggle(installmentId: number) {
    setSelected((current) =>
      current.includes(installmentId) ? current.filter((id) => id !== installmentId) : [...current, installmentId],
    );
  }

  function openForSelected() {
    const total = round2(
      installments.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.totalOutstanding, 0),
    );
    if (total <= 0) return;
    setDialog({ amount: total, kind: "CATCH_UP" });
  }

  const loan = context?.loan ?? null;
  const notYetPaid = installments.filter((item) => item.totalOutstanding > 0).length;
  const paidInstallments = installments.length - notYetPaid;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button type="button" variant="ghost" size="sm" className="-ml-2 h-8 gap-1 px-2 text-xs" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            All loans
          </Button>
          <h1 title={loan?.loan_no ?? undefined} className="mt-1 truncate text-lg font-semibold tabular-nums">{loan?.loan_no ?? "Loading…"}</h1>
          <p title={loan?.lender_name ?? undefined} className="truncate text-sm text-muted-foreground">
            {loan ? `${loan.lender_name}${loan.account_no ? ` · ${loan.account_no}` : ""}` : "Reading the loan…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {loan ? <StatusBadge tone={LOAN_STATUS_TONE[loan.status] ?? "neutral"}>{LOAN_STATUS_LABEL[loan.status] ?? loan.status}</StatusBadge> : null}
          {loan ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              installment {formatCurrency(loan.installment_amount)} · matures {mdy(loan.maturity_date)}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <Notice tone="danger" title="The loan could not be read.">
          {error}
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 min-[1100px]:grid-cols-4">
        <KpiTile
          tone="due"
          label="Amount due now"
          value={context ? formatCurrency(figures.amountDueNow) : null}
          subtext={
            !context
              ? "Reading the schedule…"
              : figures.overdueCount > 0
                ? `${formatNumber(figures.overdueCount)} overdue · ${formatCurrency(figures.overdueAmount)}`
                : "Nothing past its payable date"
          }
          icon={<Scale className="h-4 w-4" aria-hidden />}
        />
        <KpiTile
          tone="next"
          label="Next installment"
          value={figures.next ? formatCurrency(figures.next.totalOutstanding) : context ? "Nothing left" : null}
          subtext={
            figures.next
              ? `Payable ${mdy(figures.next.paymentDueDate)}${
                  figures.next.penalty > 0.005 ? ` · incl. ${formatCurrency(figures.next.penalty)} penalty` : ""
                }`
              : "Every installment is settled"
          }
          icon={<Landmark className="h-4 w-4" aria-hidden />}
        />
        <KpiTile
          tone="advance"
          label="Advance with lender"
          value={context ? formatCurrency(loan?.advance_balance ?? 0) : null}
          subtext="Unapplied credit held for this loan"
          icon={<Wallet className="h-4 w-4" aria-hidden />}
        />
        <KpiTile
          tone="payoff"
          label="Payoff if paid off today"
          value={context ? formatCurrency(context.payoff) : null}
          subtext="Before any prepayment penalty"
          icon={<Receipt className="h-4 w-4" aria-hidden />}
        />
      </div>

      {loan ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {loan.penalty_rate_monthly > 0 ? (
              <>
                Lender charges <span className="font-medium text-foreground">{formatNumber(loan.penalty_rate_monthly)}% a month</span> on
                overdue amounts after{" "}
                <span className="font-medium text-foreground">{formatNumber(loan.grace_days)} days</span> past the payable date. A
                payment takes the accrued penalty first.
              </>
            ) : (
              <>This loan carries no penalty rate, so nothing extra is charged on a late installment.</>
            )}
          </p>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5 px-3 text-xs"
            disabled={!figures.next}
            onClick={() => setDialog({ amount: figures.next?.totalOutstanding ?? null, kind: "NORMAL" })}
          >
            Pay next installment
          </Button>
        </div>
      ) : null}

      <InstallmentsCard
        context={context}
        isLoading={isLoading}
        filter={filter}
        onFilterChange={setFilter}
        selected={selected}
        onToggle={toggle}
        onPay={(item) => setDialog({ amount: item.totalOutstanding, kind: "NORMAL" })}
        onPaySelected={openForSelected}
      />

      <PaymentHistoryCard
        rows={history.rows}
        isLoading={history.isLoading}
        accounts={context?.accounts ?? []}
        filters={history.filters}
        onChange={history.updateFilters}
        onClear={history.clearFilters}
        onOpen={(row) => setDetailId(row.id)}
      />

      <Card className="overflow-hidden">
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="statement" className="border-b border-border">
            <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
              Compare with the lender&apos;s statement of account
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 text-sm">
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Figure label="Paid so far" value={context ? formatCurrency(round2(installments.reduce((sum, item) => sum + item.paidAmount, 0))) : "not recorded"} />
                <Figure label="Still owed" value={context ? formatCurrency(context.payoff) : "not recorded"} />
                <Figure label="Installments paid" value={context ? `${formatNumber(paidInstallments)} of ${formatNumber(installments.length)}` : "not recorded"} />
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                A lender&apos;s statement is the other half of this comparison. Record it, and write off the difference, in the
                loan reconciliation desk. This screen only shows what the books say.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3 h-8 text-xs">
                <Link href="/fm/treasury/loan-management/loan-register/reconciliation">Open the reconciliation desk</Link>
              </Button>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="catch-up" className="border-b-0">
            <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
              Adding a loan you&apos;ve been paying for a while? Record its past installments in one step
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 text-sm">
              <p className="text-xs text-muted-foreground">
                A single payment is allocated oldest installment first, penalty included, so one receipt can clear everything that was
                paid before this loan reached the books. Choose the installments whose money already changed hands in the card above,
                or take all of them at once.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 h-8 text-xs"
                disabled={figures.pastTotal <= 0}
                onClick={() => setDialog({ amount: figures.pastTotal, kind: "CATCH_UP" })}
              >
                {figures.pastTotal > 0
                  ? `Record ${formatCurrency(figures.pastTotal)} for ${formatNumber(figures.pastCount)} past-due installments`
                  : "Nothing past its payable date to catch up"}
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      <RecordPaymentDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        loan={dialogLoan}
        presetAmount={dialog?.amount ?? null}
        presetKind={dialog?.kind ?? "NORMAL"}
        onRecorded={afterRecorded}
      />

      <PaymentDetailDialog
        paymentId={detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        onChanged={afterRecorded}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  subtext,
  icon,
  tone,
}: {
  label: string;
  value: string | null;
  subtext: string;
  icon: React.ReactNode;
  tone: "due" | "next" | "advance" | "payoff";
}) {
  const ring: Record<"due" | "next" | "advance" | "payoff", string> = {
    due: "border-l-destructive/60",
    next: "border-l-border",
    advance: "border-l-border",
    payoff: "border-l-primary/60",
  };

  return (
    <Card className={`border-l-[3px] ${ring[tone]} ${ACCENT.tile} px-4 py-3`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      {value === null ? (
        <Skeleton className="mt-1.5 h-6 w-24" />
      ) : (
        <p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
      )}
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtext}</p>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  );
}
