"use client";

import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { paymentShiftReason } from "@/modules/financial-management/treasury/loan-management/loan-schedules/services/kpis";

import {
  BUSINESS_DAY_RULE_LABEL,  DST_TREATMENT_LABEL,
  FIRST_PERIOD_BASIS_LABEL,
  LENDER_TYPE_LABEL,
  LOAN_STATUS_LABEL,
  LOAN_STATUS_TONE,
  PAYMENT_FREQUENCY_LABEL,
  RATE_TYPE_LABEL,
  REPAYMENT_METHOD_LABEL,
  SECURITY_LABEL,
  toneClass,
} from "../constants";
import { formatDateMDY, phtDisplayStamp, phtToday } from "../pht";
import type { LoanListRow } from "../types";
import type { LoanSchedulePreview } from "../providers/registerApi";

function stamp(value: string | null): string {
  return value ? stampOrDate(value) : "not recorded";
}

/** `release_date` is the drawdown date agreed on the terms sheet; the release itself is
 *  `released_at` plus status CURRENT. Naming the date "released" made readers think it had
 *  happened, so the line states which of the two it is. */
// Rows written from a date column arrive as midnight, and printing 00:00:00 beside a date reads
// like a recorded time. Anything with a real time keeps its seconds.
function stampOrDate(value: string): string {
  return /T00:00:00(\.0+)?$/.test(value) ? formatDateMDY(value) : phtDisplayStamp(value);
}
function releaseLine(loan: LoanListRow): string {
  if (loan.released_at) return `Released ${stampOrDate(loan.released_at)}`;
  const due = loan.release_date < phtToday();
  return due
    ? `Release date ${formatDateMDY(loan.release_date)} has passed, still not released`
    : `Release date ${formatDateMDY(loan.release_date)}, not released yet`;
}

export function LoanDetailDialog({
  loan,
  schedule,
  scheduleError,
  showingAll = false,
  onShowAll,
  onOpenChange,
}: {
  loan: LoanListRow | null;
  schedule: LoanSchedulePreview | null;
  scheduleError: string | null;
  /** True once the reader asked for every installment instead of the first page. */
  showingAll?: boolean;
  onShowAll?: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const installmentsRef = useRef<HTMLDivElement | null>(null);
  const wasShowingAll = useRef(showingAll);

  // Collapsing a long list left the body scrolled past the table, so the reader landed on the
  // groups below it. Put the installments back at the top of the view when the list shrinks.
  useEffect(() => {
    const collapsed = wasShowingAll.current && !showingAll;
    wasShowingAll.current = showingAll;
    const body = bodyRef.current;
    const anchor = installmentsRef.current;
    if (!collapsed || !body || !anchor) return;
    body.scrollTo({
      top: Math.max(0, anchor.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 8),
    });
  }, [showingAll]);

  return (
    <Dialog open={loan !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[85vw] lg:max-w-[1000px]"
      >
        <DialogHeader className="space-y-2 border-b px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="line-clamp-1">
                {loan ? `${loan.loan_no} · ${loan.lender_name}` : "Loan"}
              </DialogTitle>
              {loan ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {LENDER_TYPE_LABEL[loan.lender_type]} · {PAYMENT_FREQUENCY_LABEL[loan.payment_frequency].toLowerCase()}{" "}
                  × {formatNumber(loan.term_payments)} · {releaseLine(loan)}
                </p>
              ) : null}
            </div>
            {loan ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={toneClass(LOAN_STATUS_TONE[loan.status])}>
                  {LOAN_STATUS_LABEL[loan.status]}
                </Badge>
                {/* QA1: a second badge that restated the first made "pending approval" read as
                    two different answers. The status badge is the only state; the approval
                    decision lives in the Trail group with its stamp. */}
                {loan.schedule_version > 1 ? (
                  <Badge variant="outline">Schedule v{loan.schedule_version}</Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogHeader>

        {loan ? (
          <div ref={bodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Principal" value={formatCurrency(loan.principal)} />
              <Tile label="Outstanding" value={formatCurrency(loan.outstandingPrincipal)} />
              <Tile label="Installment" value={formatCurrency(loan.installment_amount)} />
              <Tile label="Net proceeds" value={formatCurrency(loan.proceeds_net)} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Group title="Terms">
                <Row label="Repayment method" value={REPAYMENT_METHOD_LABEL[loan.repayment_method]} />
                <Row label="First payment" value={formatDateMDY(loan.first_payment_date)} />
                <Row label="Maturity" value={formatDateMDY(loan.maturity_date)} />
                <Row label="First period interest" value={FIRST_PERIOD_BASIS_LABEL[loan.first_period_basis]} />
                <Row label="Due date on a holiday" value={BUSINESS_DAY_RULE_LABEL[loan.business_day_rule]} />
                <Row
                  label="Security"
                  value={
                    loan.security === "NONE"
                      ? "None"
                      : `${SECURITY_LABEL[loan.security]}${
                          loan.security_value === null ? "" : ` · ${formatCurrency(loan.security_value)}`
                        }`
                  }
                />
              </Group>

              <Group title="Installments">
              {scheduleError ? (
                <Row label="The schedule" value={scheduleError} />
              ) : !schedule ? (
                <Row label="The schedule" value="Reading the installments…" />
              ) : schedule.rows.length === 0 ? (
                <Row label="The schedule" value="No installments have been built for this loan." />
              ) : (
                <div ref={installmentsRef} className="px-4 py-3">
                  {/* The dialog column is narrower than six money columns, so the table keeps its
                      widths and scrolls inside the card instead of clipping the balance. */}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] table-fixed text-xs">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="w-9 py-1 pl-0 pr-3 text-left font-medium">#</th>
                          <th className="w-[150px] py-1 pl-4 pr-3 text-left font-medium">Payment due</th>
                          <th className="py-1 pl-3 pr-4 text-right font-medium last:pr-4">Payment</th>
                          <th className="py-1 pl-3 pr-4 text-right font-medium last:pr-4">Principal</th>
                          <th className="py-1 pl-3 pr-4 text-right font-medium last:pr-4">Interest</th>
                          <th className="py-1 pl-3 pr-4 text-right font-medium last:pr-4">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {schedule.rows.map((row) => {
                          const reason = paymentShiftReason(row.due_date, row.payment_due_date, schedule.holidays);
                          return (
                            <tr key={row.id}>
                              <td className="py-1 pl-0 pr-3 tabular-nums text-muted-foreground">{row.period_no}</td>
                              {/* QA 5: the payable date is a column of its own, printed for every row, and a
                                  shifted one names the weekend or holiday it moved off. Two lines, never four:
                                  the payable date, then "was <scheduled date> · <reason>". */}
                              <td className="py-1 pl-4 pr-3 tabular-nums">
                                <span className="block whitespace-nowrap">{formatDateMDY(row.payment_due_date)}</span>
                                {row.payment_due_date && row.payment_due_date !== row.due_date ? (
                                  <span
                                    className="block truncate text-[11px] text-muted-foreground"
                                    title={`was ${formatDateMDY(row.due_date)}${reason ? ` · ${reason}` : ""}`}
                                  >
                                    was {formatDateMDY(row.due_date)}
                                    {reason ? ` · ${reason}` : ""}
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-1 pl-3 pr-4 text-right tabular-nums">{formatCurrency(row.payment)}</td>
                              <td className="py-1 pl-3 pr-4 text-right tabular-nums">{formatCurrency(row.principal)}</td>
                              <td className="py-1 pl-3 pr-4 text-right tabular-nums">{formatCurrency(row.interest)}</td>
                              <td className="py-1 pl-3 pr-4 text-right tabular-nums">{formatCurrency(row.closing_principal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-muted-foreground">
                    <span>
                      {showingAll
                        ? `All ${formatNumber(schedule.total)} installments.`
                        : schedule.total > schedule.rows.length
                          ? `The first ${schedule.rows.length} of ${formatNumber(schedule.total)} installments.`
                          : `${formatNumber(schedule.total)} installment${schedule.total === 1 ? "" : "s"} in this version.`}
                    </span>
                    {onShowAll && (showingAll || schedule.total > schedule.rows.length) ? (
                      <button
                        type="button"
                        onClick={onShowAll}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {showingAll ? "Show the first rows again" : `Show all ${formatNumber(schedule.total)}`}
                      </button>
                    ) : null}
                  </p>
                </div>
              )}
            </Group>

            <Group title="Rate and charges">
                <Row
                  label="Nominal rate a year"
                  value={`${formatNumber(loan.nominal_rate, "en-PH", 4)}% ${RATE_TYPE_LABEL[loan.rate_type].toLowerCase()}`}
                  strong
                />
                <Row
                  label="Effective rate a year"
                  value={`${formatNumber(loan.eir_rate * 100, "en-PH", 4)}%`}
                  strong
                />
                <Row
                  label="Penalty"
                  value={`${formatNumber(loan.penalty_rate_monthly, "en-PH", 2)}% a month · ${formatNumber(loan.grace_days)} grace days`}
                />
                <Row label="Processing fee" value={formatCurrency(loan.processing_fee)} />
                <Row
                  label="Stamp tax"
                  value={`${formatCurrency(loan.dst_amount)} · ${DST_TREATMENT_LABEL[loan.dst_treatment].toLowerCase()}`}
                />
                <Row label="Other costs" value={formatCurrency(loan.other_costs)} />
              </Group>

              <Group title="Money and holding">
                <Row label="Paid to date" value={formatCurrency(loan.paidToDate)} />
                <Row label="Advance held" value={formatCurrency(loan.advance_balance)} />
                <Row label="Proceeds account" value={loan.proceedsAccountLabel ?? "not recorded"} />
                <Row label="Branch" value={loan.branch || "not recorded"} />
                <Row label="Account officer" value={loan.account_officer || "not recorded"} />
                <Row label="Loan account / PN number" value={loan.account_no} />
              </Group>

              <Group title="Trail">
                <Row label="Submitted" value={stamp(loan.submitted_at)} />
                <Row label="Approved" value={stamp(loan.approved_at)} />
                <Row label="Released" value={stamp(loan.released_at)} />
                <Row label="Closed" value={stamp(loan.closed_at)} />
                <Row label="PAS 23" value={Number(loan.pas23_applies) === 1 ? leaseWord(loan) : "Not applied"} />
                <Row label="Purpose" value={loan.purpose || "not recorded"} />
              </Group>
            </div>

            {loan.remarks ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remarks</p>
                <p className="mt-1 text-sm">{loan.remarks}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function leaseWord(loan: LoanListRow): string {
  const type = loan.pas23_borrowing_type === "GENERAL" ? "General" : "Specific";
  return `${type} · ${loan.pas23_asset || "asset not named"}`;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums" title={value}>
        {value}
      </p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/60">
      <h3 className="border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="divide-y divide-border/50">{children}</dl>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right tabular-nums", strong && "font-semibold")} title={value}>
        {value}
      </dd>
    </div>
  );
}
