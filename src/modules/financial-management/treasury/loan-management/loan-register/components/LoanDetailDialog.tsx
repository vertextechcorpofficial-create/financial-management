"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatNumber } from "@/lib/utils";

import {
  APPROVAL_STATUS_LABEL,
  BUSINESS_DAY_RULE_LABEL,
  DST_TREATMENT_LABEL,
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
import { phtDisplayStamp } from "../pht";
import type { LoanListRow } from "../types";

function stamp(value: string | null): string {
  return value ? phtDisplayStamp(value) : "—";
}

export function LoanDetailDialog({
  loan,
  onOpenChange,
}: {
  loan: LoanListRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={loan !== null} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[820px]">
        <div className="flex max-h-[85vh] flex-col overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="line-clamp-1">
              {loan ? `${loan.loan_no} · ${loan.lender_name}` : "Loan"}
            </DialogTitle>
            {loan ? (
              <p className="text-xs text-muted-foreground">
                {LENDER_TYPE_LABEL[loan.lender_type]} · released {loan.release_date} ·{" "}
                {PAYMENT_FREQUENCY_LABEL[loan.payment_frequency].toLowerCase()} for{" "}
                {formatNumber(loan.term_payments)} payments
              </p>
            ) : null}
          </DialogHeader>

          {loan ? (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={toneClass(LOAN_STATUS_TONE[loan.status])}>
                  {LOAN_STATUS_LABEL[loan.status]}
                </Badge>
                <Badge variant="outline">{APPROVAL_STATUS_LABEL[loan.approval_status]}</Badge>
                {loan.schedule_version > 1 ? (
                  <Badge variant="outline">schedule v{loan.schedule_version}</Badge>
                ) : null}
              </div>

              <Section title="Money">
                <Detail label="Principal" value={formatCurrency(loan.principal)} />
                <Detail label="Net proceeds" value={formatCurrency(loan.proceeds_net)} />
                <Detail label="Installment" value={formatCurrency(loan.installment_amount)} />
                <Detail label="Outstanding principal" value={formatCurrency(loan.outstandingPrincipal)} />
                <Detail label="Paid to date" value={formatCurrency(loan.paidToDate)} />
                <Detail label="Advance held" value={formatCurrency(loan.advance_balance)} />
                <Detail
                  label="Nominal rate a year"
                  value={`${formatNumber(loan.nominal_rate, "en-PH", 4)}% ${RATE_TYPE_LABEL[loan.rate_type].toLowerCase()}`}
                />
                <Detail
                  label="Effective rate a year"
                  value={`${formatNumber(loan.eir_rate * 100, "en-PH", 4)}%`}
                />
              </Section>

              <Section title="Terms">
                <Detail label="Repayment method" value={REPAYMENT_METHOD_LABEL[loan.repayment_method]} />
                <Detail label="Release date" value={loan.release_date} />
                <Detail label="First payment" value={loan.first_payment_date} />
                <Detail label="Maturity" value={loan.maturity_date ?? "—"} />
                <Detail label="First period interest" value={FIRST_PERIOD_BASIS_LABEL[loan.first_period_basis]} />
                <Detail label="Holiday rule" value={BUSINESS_DAY_RULE_LABEL[loan.business_day_rule]} />
                <Detail label="Security" value={SECURITY_LABEL[loan.security]} />
                <Detail
                  label="Security value"
                  value={loan.security_value === null ? "—" : formatCurrency(loan.security_value)}
                />
              </Section>

              <Section title="Costs">
                <Detail label="Processing fee" value={formatCurrency(loan.processing_fee)} />
                <Detail
                  label="Stamp tax"
                  value={`${formatCurrency(loan.dst_amount)} · ${DST_TREATMENT_LABEL[loan.dst_treatment].toLowerCase()}`}
                />
                <Detail label="Other costs" value={formatCurrency(loan.other_costs)} />
                <Detail
                  label="Penalty"
                  value={`${formatNumber(loan.penalty_rate_monthly, "en-PH", 2)}% a month · ${formatNumber(loan.grace_days)} grace days`}
                />
                <Detail label="Proceeds account" value={loan.proceedsAccountLabel ?? "—"} />
                <Detail
                  label="PAS 23"
                  value={
                    Number(loan.pas23_applies) === 1
                      ? `${loan.pas23_borrowing_type ?? "general"} · ${loan.pas23_asset ?? "asset not named"}`
                      : "not applied"
                  }
                />
              </Section>

              <Section title="Dates">
                <Detail label="Submitted" value={stamp(loan.submitted_at)} />
                <Detail label="Approved" value={stamp(loan.approved_at)} />
                <Detail label="Released" value={stamp(loan.released_at)} />
                <Detail label="Closed" value={stamp(loan.closed_at)} />
              </Section>

              {loan.remarks ? (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remarks</p>
                  <p className="text-sm">{loan.remarks}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="border-t bg-muted/20 px-6 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate tabular-nums" title={value}>
        {value}
      </dd>
    </div>
  );
}
