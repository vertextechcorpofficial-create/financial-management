"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatNumber } from "@/lib/utils";

import { CHANGE_KIND_LABEL, CHANGE_KIND_TONE, CHANGE_STATUS_LABEL, CHANGE_STATUS_TONE, PREPAYMENT_OPTION_LABEL } from "../constants";
import { formatDateMDY } from "../pht";
import { reverseChangeRequest } from "../providers/changesApi";
import type { ChangeListRow } from "../types";
import { Notice } from "./Notice";
import { StatusBadge } from "./StatusBadge";

interface Props {
  change: ChangeListRow | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** One value when nothing moved, otherwise "before → after": an unchanged pair says nothing. */
function moved(before: string, after: string): string {
  return before === after ? after : `${before} → ${after}`;
}

export function ChangeDetailDialog({ change, onOpenChange, onChanged }: Props) {
  const [isReversing, setIsReversing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!change) {
      setIsConfirming(false);
      setReason("");
      setIsReversing(false);
    }
  }, [change]);

  async function reverse() {
    if (!change) return;
    setIsReversing(true);
    try {
      await reverseChangeRequest(change.id, reason.trim() || null);
      toast.success(`${change.changeNo} reversed; the loan is back on the previous schedule version.`);
      onChanged();
      onOpenChange(false);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "The change could not be reversed.");
    } finally {
      setIsReversing(false);
    }
  }

  return (
    <Dialog open={change !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[640px]"
      >
        <DialogHeader className="gap-2 border-b border-border px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <DialogTitle className="line-clamp-1">{change?.changeNo ?? "Change"}</DialogTitle>
            {change ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge tone={CHANGE_KIND_TONE[change.kind]}>{CHANGE_KIND_LABEL[change.kind]}</StatusBadge>
                <StatusBadge tone={CHANGE_STATUS_TONE[change.status]}>{CHANGE_STATUS_LABEL[change.status]}</StatusBadge>
                {change.scheduleVersion ? <StatusBadge tone="neutral">v{change.scheduleVersion}</StatusBadge> : null}
                {change.entryNo ? <StatusBadge tone="neutral">{change.entryNo}</StatusBadge> : null}
              </div>
            ) : null}
          </div>
          <DialogDescription className="line-clamp-2 max-w-md">
            {change
              ? `${change.loanNo ?? "No loan"} · ${change.lenderName ?? "No lender"} · effective ${formatDateMDY(change.effectiveDate)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
            {change ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{change.kind === "PREPAYMENT" || change.kind === "PAYOFF" ? "Amount" : "New rate"}</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {change.kind === "PREPAYMENT" || change.kind === "PAYOFF"
                        ? change.amount === null
                          ? "not recorded"
                          : formatCurrency(change.amount)
                        : change.newRate === null
                          ? "not recorded"
                          : `${change.newRate}%`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Penalty</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {change.penaltyAmount === 0 ? "none" : formatCurrency(change.penaltyAmount)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Gain / loss</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {change.gainLoss === 0 ? "none" : formatCurrency(change.gainLoss)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Installment after</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {change.newInstallment === null ? "not recorded" : formatCurrency(change.newInstallment)}
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-border/60">
                  <div className="border-b border-border/60 bg-muted/20 px-4 py-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Before and after</h3>
                  </div>
                  <div className="divide-y divide-border/50">
                  <Row label="Installment" value={moved(change.oldInstallment === null ? "not recorded" : formatCurrency(change.oldInstallment), change.newInstallment === null ? "not recorded" : formatCurrency(change.newInstallment))} />
                  <Row label="Maturity" value={moved(change.oldMaturity ? formatDateMDY(change.oldMaturity) : "not recorded", change.newMaturity ? formatDateMDY(change.newMaturity) : "not recorded")} />
                  <Row label="Amount prepaid" value={change.amount === null ? "not recorded" : formatCurrency(change.amount)} />
                  <Row label="Penalty" value={change.penaltyAmount === 0 ? "none" : `${formatCurrency(change.penaltyAmount)} at ${change.penaltyRate ?? 0}%`} />
                  <Row label="Rate" value={moved(change.currentBorrowingRate === null ? "not recorded" : `${change.currentBorrowingRate}%`, change.newRate === null ? "not recorded" : `${change.newRate}%`)} />
                  {change.prepaymentOption ? (
                    <Row label="Option" value={PREPAYMENT_OPTION_LABEL[change.prepaymentOption]} />
                  ) : null}
                  {change.newTermPayments !== null ? (
                    <Row label="Installments" value={formatNumber(change.newTermPayments)} />
                  ) : null}
                  {change.restructureTestPct !== null ? (
                    <Row
                      label="10% test"
                      value={`${change.restructureTestPct.toFixed(2)}% · ${change.restructureSubstantial ? "substantial" : "not substantial"}`}
                    />
                  ) : null}
                  <Row label="Gain / loss" value={change.gainLoss === 0 ? "none" : formatCurrency(change.gainLoss)} />
                  <Row label="Money account" value={change.accountLabel ?? "not recorded"} />
                    <Row label="Notes" value={change.notes ?? "none"} />
                  </div>
                </div>
              </>
            ) : null}

            {isConfirming && change ? (
              <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3">
                <p className="text-sm">
                  Reversing {change.changeNo} posts the mirror entry and puts the loan back on schedule version{" "}
                  {Math.max(1, (change.scheduleVersion ?? 1) - 1)}.
                </p>
                <Label htmlFor="reverse-reason">Reason (optional)</Label>
                <Input
                  id="reverse-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why the change is being undone"
                  className="h-9"
                />
              </div>
            ) : null}

            {change && change.status === "REVERSED" ? (
              <Notice tone="info">
                This change was reversed, so the loan runs on the version it held before it.
              </Notice>
            ) : null}
          </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isReversing}>
                Close
              </Button>
            </DialogClose>
            {change && change.status === "POSTED" ? (
              isConfirming ? (
                <Button type="button" variant="destructive" onClick={() => void reverse()} disabled={isReversing}>
                  {isReversing ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                      Reversing
                    </>
                  ) : (
                    "Reverse this change"
                  )}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => setIsConfirming(true)}>
                  Reverse
                </Button>
              )
            ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
