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
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

import { LENDER_TYPE_LABEL, LOAN_STATUS_LABEL, LOAN_STATUS_TONE } from "../constants";
import { phtDisplayStamp } from "../pht";
import { Notice } from "./Notice";
import { StatusBadge } from "./StatusBadge";
import type { ApprovalDetail, ApprovalQueueRow, ReleasePreview } from "../types";

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
  // `releaseDate` is the drawdown date on the terms sheet, not the act of release; the act is
  // `releasedAt`. Printing the date as "released" made a waiting loan read as already paid out.
  const releaseLine = detail?.releasedAt
    ? `released ${phtDisplayStamp(detail.releasedAt)}`
    : canRelease
      ? `release date ${row.releaseDate}, not released yet`
      : `release date ${row.releaseDate}`;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[840px]"
      >
        <DialogHeader className="space-y-1.5 border-b px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle className="flex min-w-0 items-center gap-2">
              <span className="truncate tabular-nums">{row.loanNo}</span>
              <span className="text-sm font-normal text-muted-foreground">·</span>
              <span className="truncate text-sm font-normal text-muted-foreground">{row.lenderName}</span>
            </DialogTitle>
            <StatusBadge tone={LOAN_STATUS_TONE[row.status]}>{LOAN_STATUS_LABEL[row.status]}</StatusBadge>
          </div>
          <DialogDescription className="text-xs">
            {LENDER_TYPE_LABEL[row.lenderType]}
            {row.branch ? ` · ${row.branch}` : ""} ·{" "}
            {releaseLine}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Principal" value={formatCurrency(row.principal)} />
            <Tile label="Net proceeds" value={formatCurrency(row.proceedsNet)} />
            <Tile label="Installment" value={formatCurrency(row.installmentAmount)} />
            <Tile label="Term" value={`${formatNumber(row.termPayments)} payments`} />
          </div>

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

          <div className="grid gap-4 md:grid-cols-2">
            <Group title="Terms">
              <Row label="Rate" value={`${formatNumber(row.annualRate, "en-PH", 4)}% a year`} />
              <Row label="Release date" value={row.releaseDate} />
              <Row label="Maturity" value={row.maturityDate ?? "—"} />
              <Row label="Proceeds account" value={row.proceedsAccountLabel ?? "No active account"} />
              <Row label="Schedule" value={row.hasSchedule ? "Built" : "Not built yet"} />
              <Row label="Account number" value={detail?.accountNo ?? "—"} />
            </Group>

            <Group title="Trail">
              <Row
                label="Submitted"
                value={row.submittedAt ? phtDisplayStamp(row.submittedAt) : "Not recorded"}
              />
              <Row
                label="Submitted by"
                value={detail?.submittedByName ?? "—"}
                title={detail?.submittedByName ?? "The submitter was not recorded on this loan."}
              />
              <Row
                label="Approved by"
                value={detail?.approvedByName ?? (detail?.approvedAt ? "—" : "Not approved yet")}
                title={detail?.approvedByName ?? undefined}
              />
              <Row label="Purpose" value={detail?.purpose ?? "—"} title={detail?.purpose ?? undefined} />
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
              Reading the approval trail…
            </p>
          ) : null}

          {detail ? (
            <section aria-labelledby="approval-trail-heading" className="space-y-2">
              <h3
                id="approval-trail-heading"
                className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Approval and event trail
              </h3>
              {detail.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing recorded on this loan yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {detail.timeline.map((entry) => (
                    <li key={entry.id} className="border-l-2 border-border pl-3">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="font-medium">{entry.label}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {entry.occurredAt ? phtDisplayStamp(entry.occurredAt) : "No date recorded"}
                        </span>
                      </p>
                      {entry.description ? <p className="text-xs text-muted-foreground">{entry.description}</p> : null}
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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
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

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right tabular-nums")} title={title ?? value}>
        {value}
      </dd>
    </div>
  );
}
