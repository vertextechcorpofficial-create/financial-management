"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeft, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

import { DateField } from "./DateField";
import { StatusBadge } from "./StatusBadge";
import { TablePager, pageCountFor } from "./TablePager";
import {
  ACCENT,
  INSTALLMENT_STATUSES,
  INSTALLMENT_STATUS_LABEL,
  INSTALLMENT_STATUS_TONE,
  LOAN_STATUS_LABEL,
  LOAN_STATUS_TONE,
  PAYMENT_FREQUENCY_LABEL,
  RATE_TYPE_LABEL,
  REPAYMENT_METHOD_LABEL,
  SELECT_VALUE_CLIP,
  toneClass,
} from "../constants";
import { formatDateMDY } from "../pht";
import { paymentShiftReason } from "../services/kpis";
import type { useSchedules } from "../hooks/useSchedules";
import type { LoanScheduleRow, ScheduleLoanEntry } from "../types";

type ScheduleView = "lender" | "eir";

function money(value: number): string {
  return formatCurrency(value);
}

function rate(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** `eir_rate` is stored as a fraction (0.1142), unlike the nominal rate's percent. */
function effectiveRate(value: number): string {
  return value > 0 ? `${(value * 100).toFixed(2)}%` : "not set";
}

function paidOn(row: LoanScheduleRow): number {
  return row.paid_principal + row.paid_interest + row.paid_penalty;
}

function paidTitle(row: LoanScheduleRow): string {
  const parts = [
    `Principal ${money(row.paid_principal)}`,
    `interest ${money(row.paid_interest)}`,
    `penalty ${money(row.paid_penalty)}`,
  ];
  if (row.paid_on) parts.push(`paid on ${formatDateMDY(row.paid_on)}`);
  return parts.join(" · ");
}

function Kpi({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-border/50 bg-card px-3 py-2.5 shadow-sm ${className ?? ""}`}>
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{hint}</p> : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="truncate text-sm tabular-nums" title={value}>
        {value}
      </dd>
    </div>
  );
}

function LoanDetails({ loan }: { loan: ScheduleLoanEntry }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8">
          Loan details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[95vw] overflow-y-auto rounded-2xl sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>{loan.loanNo}</DialogTitle>
          <DialogDescription>
            The terms the schedule is built from. Anything not held on this loan is left out rather than guessed.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label="Loan ID" value={loan.loanNo} />
          <Fact label="PN / loan account" value={loan.accountNo || "not set"} />
          <Fact label="Lender" value={loan.lenderName} />
          <Fact label="Status" value={LOAN_STATUS_LABEL[loan.status]} />
          <Fact label="Principal" value={money(loan.principal)} />
          <Fact label="Principal payable" value={money(loan.outstandingPrincipal)} />
          <Fact label="Repayment method" value={REPAYMENT_METHOD_LABEL[loan.repaymentMethod]} />
          <Fact label="Payment frequency" value={PAYMENT_FREQUENCY_LABEL[loan.paymentFrequency]} />
          <Fact label="Term" value={`${loan.termPayments} payment${loan.termPayments === 1 ? "" : "s"}`} />
          <Fact label="Installment" value={money(loan.installmentAmount)} />
          <Fact label="Nominal rate" value={rate(loan.nominalRate)} />
          <Fact label="Current rate" value={`${rate(loan.currentRate)} · ${RATE_TYPE_LABEL[loan.rateType]}`} />
          <Fact label="Effective rate (EIR)" value={effectiveRate(loan.eirRate)} />
          <Fact label="Grace days" value={String(loan.graceDays)} />
          <Fact label="Released" value={formatDateMDY(loan.releaseDate)} />
          <Fact label="Maturity" value={formatDateMDY(loan.maturityDate)} />
        </dl>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Level 2: one loan's schedule.
 *
 * The header strip, the five KPIs and both schedule views are all read from the same payload the
 * route already returns: the lender's interest/principal columns and the effective-interest
 * columns (`eir_interest`, `cost_amortization`, `close_carrying`) sit on the same rows.
 */
export function LoanView({
  schedules,
  onBack,
}: {
  schedules: ReturnType<typeof useSchedules>;
  onBack: () => void;
}) {
  const { data, filters, versions, isLoading, updateFilters, page, pageSize, setPage, setPageSize } = schedules;
  const [view, setView] = useState<ScheduleView>("lender");

  const loan = data.loan;
  const kpis = data.kpis;
  const pageCount = pageCountFor(data.total, pageSize);
  const isFiltered = filters.status !== "ALL" || filters.dueFrom !== "" || filters.dueTo !== "";
  const next = kpis.nextInstallment;

  if (!loan) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card px-4 py-12 text-center shadow-sm">
        <p className="text-sm font-medium">Reading the loan…</p>
        <p className="mt-1 text-sm text-muted-foreground">The directory is on its way back to the register.</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onBack}>
          Back to the directory
        </Button>
      </div>
    );
  }

  const versionShown = filters.version === null ? loan.scheduleVersion : filters.version;
  const versionLabel = `Version ${versionShown}${versionShown === loan.scheduleVersion ? " · current" : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          All loans
        </Button>
        <span className="text-xs text-muted-foreground">Viewing one borrowing&apos;s installments</span>
      </div>

      <div className={`overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold tabular-nums">{loan.loanNo}</h2>
              <StatusBadge tone={LOAN_STATUS_TONE[loan.status]}>{LOAN_STATUS_LABEL[loan.status]}</StatusBadge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{loan.lenderName}</p>
          </div>
          <LoanDetails loan={loan} />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-4">
          <Fact label="PN number" value={loan.accountNo || "not set"} />
          <Fact label="Repayment method" value={REPAYMENT_METHOD_LABEL[loan.repaymentMethod]} />
          <Fact label="Frequency" value={PAYMENT_FREQUENCY_LABEL[loan.paymentFrequency]} />
          <Fact label="Rate" value={`${rate(loan.currentRate)} ${loan.rateType === "FIXED" ? "fixed" : "floating"}`} />
          <Fact label="Released" value={formatDateMDY(loan.releaseDate)} />
          <Fact label="Maturity" value={formatDateMDY(loan.maturityDate)} />
          <Fact label="Principal" value={money(loan.principal)} />
          <Fact label="Schedule" value={`Version ${loan.scheduleVersion}`} />
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Next installment"
          value={next ? money(next.amount) : "None outstanding"}
          hint={next ? `#${next.periodNo} payable ${formatDateMDY(next.paymentDate)}` : "Every installment is settled"}
        />
        <Kpi
          label="Overdue"
          value={kpis.overdueAmount > 0 ? money(kpis.overdueAmount) : "None"}
          hint={
            kpis.overdueCount > 0
              ? `${kpis.overdueCount} installment${kpis.overdueCount === 1 ? "" : "s"} past the payment date`
              : "Nothing past its payment date"
          }
        />
        <Kpi label="Principal payable" value={money(kpis.principalPayable)} hint="Principal still to be repaid" />
        <Kpi
          label="Carrying amount"
          value={kpis.carryingAmount === null ? "not computed" : money(kpis.carryingAmount)}
          hint="Amortized cost at the as-of date"
        />
        <Kpi
          label="Effective cost"
          value={effectiveRate(kpis.eirRate)}
          hint="Effective rate the carrying balance accrues at"
          /* odd count in a two-column grid: the fifth tile takes the whole row instead of leaving a hole */
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-full border border-border/60 bg-muted/40 p-1 sm:w-fit">
        {(["lender", "eir"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant="ghost"
            className={`h-8 flex-1 rounded-full px-3 text-xs sm:flex-none ${
              view === value
                ? "bg-primary text-foreground shadow-sm hover:bg-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {value === "lender" ? "Lender's schedule" : "Amortized cost (EIR)"}
          </Button>
        ))}
      </div>

      <div className={`overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">
              {view === "lender" ? "Installments" : "Amortized cost"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {view === "lender"
                ? "One row per installment, oldest first, with row 0 for the release itself."
                : "Interest expense runs at the effective rate on the carrying balance; cost amortization clears the fees over the term."}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {isFiltered ? `${data.total} matching` : `${data.total} period${data.total === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-b border-border/50 px-4 py-3">
          <div className="w-full min-w-0 sm:w-[160px]">
            <Select
              value={String(versionShown)}
              onValueChange={(value) => updateFilters({ version: Number(value) })}
              disabled={versions.length === 0}
            >
              <SelectTrigger className={`h-9 w-full ${SELECT_VALUE_CLIP}`} aria-label="Schedule version" title={versionLabel}>
                <SelectValue placeholder="Version" />
              </SelectTrigger>
              <SelectContent className="max-h-60 min-w-[200px]">
                {versions.length === 0 ? (
                  <SelectItem value="1">No version yet</SelectItem>
                ) : (
                  versions.map((version) => (
                    <SelectItem key={version} value={String(version)}>
                      Version {version}
                      {version === loan.scheduleVersion ? " · current" : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full min-w-0 sm:w-[170px]">
            <Select value={filters.status} onValueChange={(value) => updateFilters({ status: value })}>
              <SelectTrigger
                className={`h-9 w-full ${SELECT_VALUE_CLIP}`}
                aria-label="Installment status"
                title={
                  filters.status === "ALL"
                    ? "All statuses"
                    : INSTALLMENT_STATUS_LABEL[filters.status as keyof typeof INSTALLMENT_STATUS_LABEL]
                }
              >
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent className="max-h-60 min-w-[200px]">
                <SelectItem value="ALL">All statuses</SelectItem>
                {INSTALLMENT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {INSTALLMENT_STATUS_LABEL[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full min-w-0 sm:w-[170px]">
            <DateField
              id="schedule-due-from"
              value={filters.dueFrom}
              onChange={(value) => updateFilters({ dueFrom: value })}
              placeholder="Due from"
              aria-label="Due from"
            />
          </div>

          <div className="w-full min-w-0 sm:w-[170px]">
            <DateField
              id="schedule-due-to"
              value={filters.dueTo}
              onChange={(value) => updateFilters({ dueTo: value })}
              placeholder="Due to"
              aria-label="Due to"
            />
          </div>

          {isFiltered ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-1 px-2 text-xs"
              onClick={() => updateFilters({ status: "ALL", dueFrom: "", dueTo: "" })}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </Button>
          ) : null}
        </div>

        {data.tie && !data.tie.ties ? (
          <div className={`flex items-start gap-2 border-b border-border/50 px-4 py-3 text-sm ${toneClass("warning")}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">The last installment does not clear the principal.</p>
              <p className="text-xs text-muted-foreground">
                {money(data.tie.schedulePrincipal)} of principal is scheduled and {money(data.tie.difference)} is still
                open after the final installment. Regenerate the schedule, or check the last restatement.
              </p>
            </div>
          </div>
        ) : null}

        {isLoading && data.rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-10 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : data.rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium">
              {isFiltered
                ? `No installment carries those filters in version ${loan.scheduleVersion}.`
                : `This loan has no schedule in version ${loan.scheduleVersion}.`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isFiltered
                ? "Clear the filters to see every installment."
                : "A schedule is written when the loan is released. Generate it, then come back."}
            </p>
          </div>
        ) : view === "lender" ? (
          <>
            <div className="hidden overflow-x-auto min-[1300px]:block">
              <Table className="[&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[56px] text-right">#</TableHead>
                    <TableHead className="w-[110px]">Due date</TableHead>
                    <TableHead className="w-[150px]">Payment due</TableHead>
                    <TableHead className="w-[120px] text-right">Interest</TableHead>
                    <TableHead className="w-[120px] text-right">Principal</TableHead>
                    <TableHead className="w-[130px] text-right">Installment</TableHead>
                    <TableHead className="w-[140px] text-right">Opening principal</TableHead>
                    <TableHead className="w-[140px] text-right">Closing principal</TableHead>
                    <TableHead className="w-[120px] text-right">Paid</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/30">
                    <TableCell className="text-right tabular-nums">0</TableCell>
                    <TableCell className="tabular-nums">{formatDateMDY(loan.releaseDate)}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">Release</TableCell>
                    <TableCell className="text-right text-muted-foreground"></TableCell>
                    <TableCell className="text-right text-muted-foreground"></TableCell>
                    <TableCell className="text-right text-muted-foreground"></TableCell>
                    <TableCell className="text-right tabular-nums">{money(loan.principal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(loan.principal)}</TableCell>
                    <TableCell className="text-right text-muted-foreground"></TableCell>
                    <TableCell>
                      <StatusBadge tone="neutral">Release</StatusBadge>
                    </TableCell>
                  </TableRow>
                  {data.rows.map((row) => {
                    const reason = paymentShiftReason(row.due_date, row.payment_due_date, data.holidays);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-right tabular-nums">{row.period_no}</TableCell>
                        <TableCell className="tabular-nums">{formatDateMDY(row.due_date)}</TableCell>
                        <TableCell className="tabular-nums">
                          {formatDateMDY(row.payment_due_date)}
                          {reason ? <span className="block text-xs text-muted-foreground">{reason}</span> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.interest)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.principal)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.payment)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {money(row.opening_principal)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.closing_principal)}</TableCell>
                        <TableCell className="text-right tabular-nums" title={paidTitle(row)}>
                          {paidOn(row) > 0 ? money(paidOn(row)) : "none"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={INSTALLMENT_STATUS_TONE[row.status]}>
                            {INSTALLMENT_STATUS_LABEL[row.status]}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="text-xs text-muted-foreground">
                      {data.total} installment{data.total === 1 ? "" : "s"} in this view
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(data.totals.interest)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(data.totals.principal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(data.totals.payment)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground"></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground"></TableCell>
                    <TableCell className="text-right tabular-nums">{money(data.totals.paid)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {!data.tie
                        ? "Not checked"
                        : data.tie.ties
                          ? data.tie.capitalised > 0
                            ? "Clears the balance"
                            : "Ties to principal"
                          : "Does not tie"}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <ul className="divide-y divide-border min-[1300px]:hidden">
              <li className="space-y-1 bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium tabular-nums">0 · Release</span>
                  <StatusBadge tone="neutral">Release</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatDateMDY(loan.releaseDate)} · opening {money(loan.principal)} · closing {money(loan.principal)}
                </p>
              </li>
              {data.rows.map((row) => {
                const reason = paymentShiftReason(row.due_date, row.payment_due_date, data.holidays);
                return (
                  <li key={row.id} className="space-y-1 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium tabular-nums">{row.period_no}</span>
                      <StatusBadge tone={INSTALLMENT_STATUS_TONE[row.status]}>
                        {INSTALLMENT_STATUS_LABEL[row.status]}
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Due {formatDateMDY(row.due_date)} · payable {formatDateMDY(row.payment_due_date)}
                      {reason ? ` (${reason})` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Installment {money(row.payment)} · interest {money(row.interest)} · principal {money(row.principal)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Closing principal {money(row.closing_principal)}
                      {paidOn(row) > 0 ? ` · paid ${money(paidOn(row))}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <div className="hidden overflow-x-auto min-[1300px]:block">
              <Table className="[&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[56px] text-right">#</TableHead>
                    <TableHead className="w-[110px]">Due date</TableHead>
                    <TableHead className="w-[150px]">Payment due</TableHead>
                    <TableHead className="w-[150px] text-right">Interest expense</TableHead>
                    <TableHead className="w-[160px] text-right">Cost amortization</TableHead>
                    <TableHead className="w-[150px] text-right">Closing carrying</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => {
                    const reason = paymentShiftReason(row.due_date, row.payment_due_date, data.holidays);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-right tabular-nums">{row.period_no}</TableCell>
                        <TableCell className="tabular-nums">{formatDateMDY(row.due_date)}</TableCell>
                        <TableCell className="tabular-nums">
                          {formatDateMDY(row.payment_due_date)}
                          {reason ? <span className="block text-xs text-muted-foreground">{reason}</span> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.eir_interest)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.cost_amortization)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.close_carrying)}</TableCell>
                        <TableCell>
                          <StatusBadge tone={INSTALLMENT_STATUS_TONE[row.status]}>
                            {INSTALLMENT_STATUS_LABEL[row.status]}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-border min-[1300px]:hidden">
              {data.rows.map((row) => {
                const reason = paymentShiftReason(row.due_date, row.payment_due_date, data.holidays);
                return (
                  <li key={row.id} className="space-y-1 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium tabular-nums">{row.period_no}</span>
                      <StatusBadge tone={INSTALLMENT_STATUS_TONE[row.status]}>
                        {INSTALLMENT_STATUS_LABEL[row.status]}
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Due {formatDateMDY(row.due_date)} · payable {formatDateMDY(row.payment_due_date)}
                      {reason ? ` (${reason})` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Interest expense {money(row.eir_interest)} · amortization {money(row.cost_amortization)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Closing carrying {money(row.close_carrying)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <TablePager
          page={page}
          pageCount={pageCount}
          total={data.total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          allowAll={false}
          isLoading={isLoading}
          className="border-t border-border/50 px-4 py-3"
        />
      </div>
    </div>
  );
}
