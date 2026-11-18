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
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

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

/** A loan waiting on a decision or a release carries a release *date*, not a release: the date is
 *  what the desk plans around, so it is named as a plan and never as something that happened. */
function releaseLine(loan: LoanListRow): string {
  if (loan.released_at) return `Released ${phtDisplayStamp(loan.released_at)}`;
  return `Release dated ${loan.release_date}, not released yet`;
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
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[860px]"
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
                {loan.status === "PENDING_APPROVAL" || loan.status === "REJECTED" ? (
                  <Badge variant="outline">{APPROVAL_STATUS_LABEL[loan.approval_status]}</Badge>
                ) : null}
                {loan.schedule_version > 1 ? (
                  <Badge variant="outline">Schedule v{loan.schedule_version}</Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogHeader>

        {loan ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Principal" value={formatCurrency(loan.principal)} />
              <Tile label="Outstanding" value={formatCurrency(loan.outstandingPrincipal)} />
              <Tile label="Installment" value={formatCurrency(loan.installment_amount)} />
              <Tile label="Net proceeds" value={formatCurrency(loan.proceeds_net)} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Group title="Terms">
                <Row label="Repayment method" value={REPAYMENT_METHOD_LABEL[loan.repayment_method]} />
                <Row label="First payment" value={loan.first_payment_date} />
                <Row label="Maturity" value={loan.maturity_date ?? "—"} />
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
                <Row label="Proceeds account" value={loan.proceedsAccountLabel ?? "—"} />
                <Row label="Branch" value={loan.branch || "—"} />
                <Row label="Account officer" value={loan.account_officer || "—"} />
                <Row label="Account number" value={loan.account_no} />
              </Group>

              <Group title="Trail">
                <Row label="Submitted" value={stamp(loan.submitted_at)} />
                <Row label="Approved" value={stamp(loan.approved_at)} />
                <Row label="Released" value={stamp(loan.released_at)} />
                <Row label="Closed" value={stamp(loan.closed_at)} />
                <Row label="PAS 23" value={Number(loan.pas23_applies) === 1 ? leaseWord(loan) : "Not applied"} />
                <Row label="Purpose" value={loan.purpose || "—"} />
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
