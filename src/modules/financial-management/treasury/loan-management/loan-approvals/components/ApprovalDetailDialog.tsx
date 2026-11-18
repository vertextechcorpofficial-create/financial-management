"use client";

import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

import { LENDER_TYPE_LABEL, LOAN_STATUS_LABEL, LOAN_STATUS_TONE } from "../constants";
import { phtDisplayStamp } from "../pht";
import { Notice } from "./Notice";
import { StatusBadge } from "./StatusBadge";
import type { ApprovalDetail, ApprovalQueueRow, ReleasePreview } from "../types";

function Fact({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm" title={title}>
        {value}
      </dd>
    </div>
  );
}

function previewSummary(preview: ReleasePreview): string {
  if (preview.missingMappingKeys.length > 0) {
    return `Release needs ${preview.missingMappingKeys.join(", ")} mapped before it can post.`;
  }
  return `Posts ${formatCurrency(preview.totalDebit)} in ${preview.lines.length} lines when released.`;
}

/** Mounted only while a row is open, so it never needs an effect to reset itself. */
export function ApprovalDetailDialog({
  row,
  detail,
  isLoading,
  isSaving,
  onClose,
  onApprove,
  onReject,
  onRelease,
}: {
  row: ApprovalQueueRow;
  detail: ApprovalDetail | null;
  isLoading: boolean;
  isSaving: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRelease: () => void;
}) {
  const canDecide = row.status === "PENDING_APPROVAL";
  const canRelease = row.status === "PENDING_RELEASE";
  const blocked = row.releaseBlockedReason;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[800px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="truncate tabular-nums">{row.loanNo}</span>
            <StatusBadge tone={LOAN_STATUS_TONE[row.status]}>{LOAN_STATUS_LABEL[row.status]}</StatusBadge>
          </DialogTitle>
          <DialogDescription className="truncate" title={row.lenderName}>
            {row.lenderName} · {LENDER_TYPE_LABEL[row.lenderType]}
            {row.branch ? ` · ${row.branch}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Principal" value={formatCurrency(row.principal)} />
            <Fact label="Net proceeds" value={formatCurrency(row.proceedsNet)} />
            <Fact label="Installment" value={formatCurrency(row.installmentAmount)} />
            <Fact label="Term" value={`${row.termPayments} payments`} />
            <Fact label="Rate" value={`${row.annualRate.toFixed(2)}% a year`} />
            <Fact label="Release date" value={row.releaseDate} />
            <Fact label="Maturity" value={row.maturityDate ?? "—"} />
            <Fact
              label="Submitted"
              value={row.submittedAt ? phtDisplayStamp(row.submittedAt) : "Not recorded"}
              title={row.submittedAt ?? undefined}
            />
            <Fact
              label="Submitted by"
              value={detail?.submittedByName ?? "—"}
              title={detail?.submittedByName ?? "The submitter was not recorded on this loan."}
            />
            <Fact
              label="Approved by"
              value={detail?.approvedByName ?? (detail?.approvedAt ? "—" : "Not approved yet")}
              title={detail?.approvedByName ?? undefined}
            />
            <Fact label="Proceeds account" value={row.proceedsAccountLabel ?? "No active account"} />
            <Fact label="Schedule" value={row.hasSchedule ? "Built" : "Not built yet"} />
            <Fact label="Purpose" value={detail?.purpose ?? "—"} title={detail?.purpose} />
            <Fact label="Account no." value={detail?.accountNo ?? "—"} title={detail?.accountNo} />
          </dl>

          {row.selfSubmitted ? (
            <Notice tone="warning" title="You submitted this loan">
              A different person should approve it. If you go ahead, the approval trail records that you approved your
              own submission.
            </Notice>
          ) : null}

          {detail?.lockedThrough ? (
            <Notice tone="info" title={`The books are closed through ${detail.lockedThrough}`}>
              A release dated on or before that date cannot post.
            </Notice>
          ) : null}

          {blocked ? (
            <Notice tone="danger" title="This loan cannot be released yet">
              {blocked}
            </Notice>
          ) : null}

          {detail ? <p className="text-xs text-muted-foreground">{previewSummary(detail.preview)}</p> : null}

          {isLoading && !detail ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Reading the approval trail…
            </p>
          ) : null}

          {detail ? (
            <section aria-labelledby="approval-trail-heading" className="space-y-2">
              <h3
                id="approval-trail-heading"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Approval and event trail
              </h3>
              {detail.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing recorded on this loan yet.</p>
              ) : (
                <ul className="space-y-3">
                  {detail.timeline.map((entry) => (
                    <li key={entry.id} className="border-l-2 pl-3">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="font-medium">{entry.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {entry.occurredAt ? phtDisplayStamp(entry.occurredAt) : "No date recorded"}
                        </span>
                      </p>
                      {entry.description ? <p className="text-xs">{entry.description}</p> : null}
                      {entry.remarks ? (
                        <p className="text-xs text-muted-foreground">Remarks: {entry.remarks}</p>
                      ) : null}
                      <p
                        className="text-[11px] text-muted-foreground"
                        title={entry.actorName ? undefined : "No person was recorded on this row."}
                      >
                        {entry.actorName ?? "—"}
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
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canDecide ? (
            <>
              <Button variant="outline" className="text-destructive" onClick={onReject} disabled={isSaving}>
                Reject…
              </Button>
              <Button onClick={onApprove} disabled={isSaving}>
                Approve…
              </Button>
            </>
          ) : null}
          {canRelease ? (
            <Button onClick={onRelease} disabled={isSaving || Boolean(blocked)} title={blocked ?? undefined}>
              Release…
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
