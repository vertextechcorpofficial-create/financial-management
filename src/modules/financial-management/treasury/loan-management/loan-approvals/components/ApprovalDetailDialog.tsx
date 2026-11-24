"use client";

import { LoaderCircle } from "lucide-react";
import type { RefObject } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

import {
  BUSINESS_DAY_RULE_LABEL,
  FIRST_PERIOD_BASIS_LABEL,
  LENDER_TYPE_LABEL,
  LOAN_STATUS_LABEL,
  LOAN_STATUS_TONE,
  PAS23_TYPE_LABEL,
  PAYMENT_FREQUENCY_LABEL,
  RATE_TYPE_LABEL,
  REPAYMENT_METHOD_LABEL,
  SECURITY_LABEL,
} from "../constants";
import { formatDateMDY, phtDisplayStamp } from "../pht";
import { Notice } from "./Notice";
import { StatusBadge } from "./StatusBadge";
import type {
  ApprovalDetail,
  ApprovalQueueRow,
  ReleasePreview,
} from "../types";

function previewSummary(preview: ReleasePreview): string {
  if (preview.missingMappingKeys.length > 0) {
    return `The release entry needs ${preview.missingMappingKeys.join(", ")} mapped before it can post.`;
  }
  return `Approving posts ${formatCurrency(preview.totalDebit)} in ${preview.lines.length} lines.`;
}

function securityLine(detail: ApprovalDetail): string {
  if (detail.security === "NONE") return SECURITY_LABEL.NONE;
  const value =
    detail.securityValue === null
      ? "no value recorded"
      : formatCurrency(detail.securityValue);
  return `${SECURITY_LABEL[detail.security]} · ${value}`;
}

/** Mounted only while a row is open, so it never needs an effect to reset itself. */
export function ApprovalDetailDialog({
  row,
  detail,
  isLoading,
  error,
  outcome,
  onRetry,
  isSaving,
  onClose,
  onApprove,
  onReject,
  returnFocusTo,
}: {
  row: ApprovalQueueRow;
  detail: ApprovalDetail | null;
  isLoading: boolean;
  error?: string | null;
  /** What the decision that was just taken did; when set, it replaces the action row. */
  outcome?: string | null;
  onRetry?: () => void;
  isSaving: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  /** The queue row that opened the dialog, so Escape puts the reader back on it. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const canDecide = row.status === "PENDING_APPROVAL";
  // `releaseDate` is the drawdown date on the terms sheet, not the act of release; the act is
  // `releasedAt`. Printing the date as "released" made a waiting loan read as already paid out.
  const releaseLine = detail?.releasedAt
    ? `released ${phtDisplayStamp(detail.releasedAt)}`
    : `release date ${formatDateMDY(row.releaseDate)}, not released yet`;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        // Radix focuses the first focusable child, which is the footer Close button: a ringed
        // button reads as a choice already made. Land on the panel instead; Escape still closes.
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        // Radix would hand focus back to whatever it captured on open, which is not the row the
        // reader clicked; put it on that row explicitly so Escape returns them to their place in
        // the queue. A row that a decision removed is gone, and then focus stays nowhere.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const opener = returnFocusTo?.current;
          if (opener?.isConnected) opener.focus();
        }}
        className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[85vw] lg:max-w-[1000px]"
      >
        <DialogHeader className="space-y-1.5 border-b px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle className="flex min-w-0 items-center gap-2">
              <span className="truncate tabular-nums">{row.loanNo}</span>
              <span className="text-sm font-normal text-muted-foreground">
                ·
              </span>
              <span className="truncate text-sm font-normal text-muted-foreground">
                {row.lenderName}
              </span>
            </DialogTitle>
            <StatusBadge tone={LOAN_STATUS_TONE[row.status]}>
              {LOAN_STATUS_LABEL[row.status]}
            </StatusBadge>
          </div>
          <DialogDescription className="text-xs">
            {LENDER_TYPE_LABEL[row.lenderType]}
            {row.branch ? ` · ${row.branch}` : ""} · {releaseLine}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Tile label="Principal" value={formatCurrency(row.principal)} />
            <Tile
              label="Net proceeds"
              value={formatCurrency(row.proceedsNet)}
            />
            <Tile
              label="Installment"
              value={formatCurrency(row.installmentAmount)}
            />
            <Tile
              label="Term"
              value={`${formatNumber(row.termPayments)} payments`}
            />
            {/* `eir_rate` is stored as a fraction (0.1243), unlike the nominal rate's percent:
                the register multiplies by 100 too, so both screens print the same number. */}
            <Tile
              label="Effective rate a year"
              value={
                detail?.eirRate
                  ? `${formatNumber(detail.eirRate * 100, "en-PH", 2)}%`
                  : "not recorded"
              }
            />
          </div>

          {row.selfSubmitted ? (
            <Notice tone="warning" title="You submitted this loan">
              A different person should approve it. If you go ahead, the
              approval trail records that you approved your own submission.
            </Notice>
          ) : null}

          {detail?.lockedThrough ? (
            <Notice
              tone="info"
              title={`The books are closed through ${formatDateMDY(detail.lockedThrough)}`}
            >
              A release dated on or before that date cannot post.
            </Notice>
          ) : null}

          {/* One full-width lender block, then terms beside their money, then the trail: the old
              two-up grid left the right half of a 1000px dialog empty (QA item 5). */}
          <div className="space-y-4">
            <Group title="Lender details">
              <Row label="Branch" value={row.branch ?? "Not recorded"} />
              <Row
                label="Account officer"
                value={detail?.accountOfficer ?? "Not recorded"}
              />
              <Row
                label="Contact phone"
                value={detail?.contactPhone ?? "Not recorded"}
              />
              <Row
                label="Contact email"
                value={detail?.contactEmail ?? "Not recorded"}
              />
              {/* What the lender holds against the loan belongs with the lender, not the terms. */}
              <Row
                label="Security"
                value={detail ? securityLine(detail) : "not recorded"}
              />
              <Row
                label="Guarantor"
                value={detail?.guarantor ?? "None recorded"}
              />
            </Group>

            <div className="grid gap-4 lg:grid-cols-2">
              <Group title="Terms">
                <Row
                  label="Repayment method"
                  value={
                    detail
                      ? `${REPAYMENT_METHOD_LABEL[detail.repaymentMethod]} · ${FIRST_PERIOD_BASIS_LABEL[detail.firstPeriodBasis]}`
                      : "not recorded"
                  }
                />
                <Row
                  label="Payment frequency"
                  value={
                    detail
                      ? PAYMENT_FREQUENCY_LABEL[detail.paymentFrequency]
                      : "not recorded"
                  }
                />
                <Row
                  label="Due dates"
                  value={
                    detail
                      ? BUSINESS_DAY_RULE_LABEL[detail.businessDayRule]
                      : "not recorded"
                  }
                />
                <Row
                  label="First payment"
                  value={
                    detail
                      ? formatDateMDY(detail.firstPaymentDate)
                      : "not recorded"
                  }
                />
                <Row
                  label="Release date"
                  value={formatDateMDY(row.releaseDate)}
                />
                <Row
                  label="Maturity"
                  value={formatDateMDY(row.maturityDate)}
                />
                <Row
                  label="Proceeds account"
                  value={row.proceedsAccountLabel ?? "No active account"}
                />
                <Row
                  label="Schedule"
                  value={row.hasSchedule ? "Built" : "Not built yet"}
                />
                <Row
                  label="Loan account / PN number"
                  value={detail?.accountNo ?? "not set"}
                />
              </Group>

              <Group title="Rate and charges">
                <Row
                  label="Nominal rate"
                  value={`${formatNumber(row.annualRate, "en-PH", 4)}% a year`}
                />
                <Row
                  label="Rate type"
                  value={
                    detail ? RATE_TYPE_LABEL[detail.rateType] : "not recorded"
                  }
                />
                <Row
                  label="PAS 23 borrowing"
                  value={
                    detail
                      ? detail.pas23Applies
                        ? ((detail.pas23BorrowingType &&
                            PAS23_TYPE_LABEL[detail.pas23BorrowingType]) ??
                          "Recorded, type not set")
                        : "Not a PAS 23 loan"
                      : "not recorded"
                  }
                />
                <Row
                  label="Processing fee"
                  value={
                    detail ? formatCurrency(detail.processingFee) : "not recorded"
                  }
                />
                <Row
                  label="Documentary stamp tax"
                  value={
                    detail ? formatCurrency(detail.dstAmount) : "not recorded"
                  }
                />
                <Row
                  label="Other costs"
                  value={
                    detail ? formatCurrency(detail.otherCosts) : "not recorded"
                  }
                />
              </Group>
            </div>

            <Group title="Trail">
              <Row label="Submitted" value={phtDisplayStamp(row.submittedAt)} />
              <Row
                label="Submitted by"
                value={detail?.submittedByName ?? "Name not recorded"}
                title={
                  detail?.submittedByName ??
                  "The submitter was not recorded on this loan."
                }
              />
              <Row
                label="Approved by"
                value={
                  detail?.approvedByName ??
                  (detail?.approvedAt
                    ? "Name not recorded"
                    : "Not approved yet")
                }
                title={detail?.approvedByName ?? undefined}
              />
              <Row
                label="Purpose"
                value={detail?.purpose ?? "Not recorded"}
                title={detail?.purpose ?? undefined}
              />
            </Group>
          </div>

          {detail ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
              {previewSummary(detail.preview)}
            </div>
          ) : null}

          {isLoading && !detail ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Reading the loan and its schedule…
            </p>
          ) : null}

          {!isLoading && error && !detail ? (
            <Notice tone="danger" title="The loan detail did not load">
              <span className="block space-y-2">
                <span className="block">{error}</span>
                {onRetry ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onRetry}
                  >
                    Try again
                  </Button>
                ) : null}
              </span>
            </Notice>
          ) : null}

          {detail ? (
            <section
              aria-labelledby="approval-trail-heading"
              className="space-y-2"
            >
              <h3
                id="approval-trail-heading"
                className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Approval and event trail
              </h3>
              {detail.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing recorded on this loan yet.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {detail.timeline.map((entry) => (
                    <li
                      key={entry.id}
                      className="border-l-2 border-border pl-3"
                    >
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="font-medium">{entry.label}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {phtDisplayStamp(entry.occurredAt)}
                        </span>
                      </p>
                      {entry.description ? (
                        <p className="text-xs text-muted-foreground">
                          {entry.description}
                        </p>
                      ) : null}
                      {entry.remarks ? (
                        <p className="text-xs text-muted-foreground">
                          Remarks: {entry.remarks}
                        </p>
                      ) : null}
                      <p
                        className="text-[11px] text-muted-foreground"
                        title={
                          entry.actorName
                            ? undefined
                            : "No person was recorded on this row."
                        }
                      >
                        {entry.actorName ?? "Name not recorded"}
                        {entry.reference ? ` · ${entry.reference}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          {outcome ? (
            <p className="mr-auto text-xs text-muted-foreground">{outcome}</p>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {outcome || !canDecide ? null : (
            <>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={onReject}
                disabled={isSaving}
              >
                Reject
              </Button>
              <Button onClick={onApprove} disabled={isSaving}>
                Approve
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/60">
      <h3 className="border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="divide-y divide-border/50">{children}</dl>
    </section>
  );
}

function Row({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn("min-w-0 truncate text-right tabular-nums")}
        title={title ?? value}
      >
        {value}
      </dd>
    </div>
  );
}
