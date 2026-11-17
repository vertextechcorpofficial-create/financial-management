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
        <div className="flex max-h-[85vh] flex-col overflow-hidden">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="line-clamp-1">{change?.changeNo ?? "Change"}</DialogTitle>
            <DialogDescription className="line-clamp-2 max-w-md">
              {change
                ? `${change.effectiveDate} · ${CHANGE_KIND_LABEL[change.kind]} · ${change.loanNo ?? "—"} · ${change.lenderName ?? "—"}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
            {change ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={CHANGE_KIND_TONE[change.kind]}>{CHANGE_KIND_LABEL[change.kind]}</StatusBadge>
                  <StatusBadge tone={CHANGE_STATUS_TONE[change.status]}>{CHANGE_STATUS_LABEL[change.status]}</StatusBadge>
                  {change.scheduleVersion ? (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
                      Schedule version {change.scheduleVersion}
                    </span>
                  ) : null}
                  {change.entryNo ? (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
                      Entry {change.entryNo}
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">No journal entry</span>
                  )}
                </div>

                <div>
                  <Row label="Installment" value={`${change.oldInstallment === null ? "—" : formatCurrency(change.oldInstallment)} → ${change.newInstallment === null ? "—" : formatCurrency(change.newInstallment)}`} />
                  <Row label="Maturity" value={`${change.oldMaturity ?? "—"} → ${change.newMaturity ?? "—"}`} />
                  <Row label="Amount prepaid" value={change.amount === null ? "—" : formatCurrency(change.amount)} />
                  <Row label="Penalty" value={change.penaltyAmount === 0 ? "—" : `${formatCurrency(change.penaltyAmount)} at ${change.penaltyRate ?? 0}%`} />
                  <Row label="Rate" value={change.newRate === null ? "—" : `${change.currentBorrowingRate ?? "—"}% → ${change.newRate}%`} />
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
                  <Row label="Gain / loss" value={change.gainLoss === 0 ? "—" : formatCurrency(change.gainLoss)} />
                  <Row label="Money account" value={change.accountLabel ?? "—"} />
                  <Row label="Notes" value={change.notes ?? "—"} />
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
