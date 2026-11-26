"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatNumber } from "@/lib/utils";

import { phtDisplayDate, phtDisplayDateStamp, toPhtDateString } from "../pht";
import { toneClass } from "../constants";
import { fetchDepositSlip } from "../providers/depositApi";
import { DateField } from "./DateField";
import { StatusBadge } from "./StatusBadge";
import { DepositPreview } from "./DepositPreview";
import type { DepositSlip, DepositSlipDetail } from "../types";

type Props = {
  slip: DepositSlip | null;
  open: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: (slipId: number, reason: string) => Promise<boolean>;
  /** Prepared -> Deposited: the bank has taken the money, on this date and under this number. */
  onDeposit: (slipId: number, confirmation: { depositDate: string; slipNo: string }) => Promise<boolean>;
};

/**
 * Read-only mirror of the creation modal (P17): same fields, same contents table, disabled
 * inputs, plus the cancellation control. Items come from the slip, not from the store.
 */
export function SlipDetailDialog({ slip, open, isSaving, onOpenChange, onCancel, onDeposit }: Props) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [depositDate, setDepositDate] = useState("");
  const [validationNo, setValidationNo] = useState("");
  const [detail, setDetail] = useState<DepositSlipDetail | null>(null);
  const [failure, setFailure] = useState<{ slipId: number; message: string } | null>(null);

  const slipId = slip?.id ?? null;
  // Keyed on the slip id, so a stale fetch from the previous slip is never rendered.
  const current = detail && detail.slip.id === slipId ? detail : null;
  const detailError = failure && failure.slipId === slipId ? failure.message : null;

  useEffect(() => {
    if (!open || !slipId) return;
    let cancelled = false;
    fetchDepositSlip(slipId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setFailure({
            slipId,
            message: cause instanceof Error ? cause.message : "The slip contents could not be read.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, slipId]);

  if (!slip) return null;

  const cancellable = slip.status !== "CANCELLED" && slip.status !== "CLEARED";
  // Only a prepared slip has anything to deposit; a deposited one is waiting on its checks.
  const depositable = slip.status === "PREPARED";
  const reasonError = reason.trim().length < 5 ? "Give a short reason (at least 5 characters)." : "";
  const items = current?.items ?? [];
  const cashTotal = items.filter((item) => item.assetType === "CASH").reduce((total, item) => total + item.amount, 0);
  const checkTotal = items.filter((item) => item.assetType === "CHECK").reduce((total, item) => total + item.amount, 0);

  // Both fields show the slip's own values until the desk types something else, so no effect is needed.
  const handoverDate = depositDate || toPhtDateString(slip.depositDate);
  const handoverNo = validationNo || (slip.referenceNo ?? "");

  async function handleDeposit() {
    if (!slip) return;
    const ok = await onDeposit(slip.id, { depositDate: handoverDate, slipNo: handoverNo.trim() });
    if (ok) onOpenChange(false);
  }

  async function handleCancel() {
    setTouched(true);
    if (reasonError || !slip) return;
    const ok = await onCancel(slip.id, reason.trim());
    if (ok) {
      setReason("");
      setTouched(false);
      setConfirming(false);
      onOpenChange(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setConfirming(false);
      setTouched(false);
      setReason("");
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="w-[95vw] rounded-2xl p-0 sm:max-w-[820px]">
        <div className="flex max-h-[88vh] flex-col overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="line-clamp-1 font-mono">{slip.depositNo}</DialogTitle>
            <DialogDescription className="line-clamp-2 max-w-md">
              {phtDisplayDate(slip.depositDate)} · {slip.targetBankLabel}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={slip.status} />
              {slip.bouncedCount > 0 ? (
                <Badge variant="outline" className={`text-[11px] ${toneClass("danger")}`}>
                  {formatNumber(slip.bouncedCount)} bounced
                </Badge>
              ) : null}
              {slip.itemCount > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {formatNumber(slip.resolvedCount)} of {formatNumber(slip.itemCount)} items resolved
                </span>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="slip-detail-bank" className="text-xs text-muted-foreground">
                  Deposit to
                </Label>
                <Input id="slip-detail-bank" value={slip.targetBankLabel} title={slip.targetBankLabel} disabled readOnly />
                <p className="text-[11px] text-muted-foreground">
                  {slip.glCode
                    ? `Linked GL ${slip.glCode}${slip.glTitle ? ` · ${slip.glTitle}` : ""}`
                    : "No GL account linked"}
                  {slip.glFallback ? " — the deposit posts to the default cash-in-bank account." : ""}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slip-detail-date" className="text-xs text-muted-foreground">
                  Deposit date
                </Label>
                {depositable ? (
                  <DateField id="slip-detail-date" value={handoverDate} onChange={setDepositDate} inDialog />
                ) : (
                  <Input id="slip-detail-date" value={phtDisplayDate(slip.depositDate)} disabled readOnly />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slip-detail-no" className="text-xs text-muted-foreground">
                  Slip / validation no.
                </Label>
                {depositable ? (
                  <Input
                    id="slip-detail-no"
                    value={handoverNo}
                    onChange={(event) => setValidationNo(event.target.value)}
                    placeholder="What the bank stamped"
                    maxLength={40}
                  />
                ) : (
                  <Input
                    id="slip-detail-no"
                    value={slip.referenceNo ?? "—"}
                    title={`Generated no. ${slip.depositNo}`}
                    disabled
                    readOnly
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slip-detail-prepared" className="text-xs text-muted-foreground">
                  Prepared by
                </Label>
                <Input
                  id="slip-detail-prepared"
                  value={slip.preparedBy ?? "—"}
                  title={slip.preparedByEmail ?? undefined}
                  disabled
                  readOnly
                />
                <p className="text-[11px] text-muted-foreground">{phtDisplayDateStamp(slip.datePrepared)}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slip-detail-remarks" className="text-xs text-muted-foreground">
                Remarks
              </Label>
              <Textarea
                id="slip-detail-remarks"
                value={slip.remarks ?? ""}
                placeholder="No remarks on this slip."
                disabled
                readOnly
                rows={2}
                className="min-h-[64px] resize-none"
              />
            </div>

            {cashTotal > 0 || checkTotal > 0 ? (
              <DepositPreview bankAccountId={slip.targetBankId} cashTotal={cashTotal} checkTotal={checkTotal} />
            ) : null}

            <div className="rounded-xl border border-border/60">
              <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-3 py-2">
                <p className="text-xs font-semibold">Deposit slip contents</p>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {items.length > 0
                    ? `${formatNumber(items.length)} ${items.length === 1 ? "item" : "items"} · ${formatCurrency(slip.grandTotal)}`
                    : `${formatCurrency(slip.grandTotal)} recorded`}
                </span>
              </div>
              {detailError ? (
                <p className="px-3 py-4 text-xs text-destructive">{detailError}</p>
              ) : !current ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-8 w-full" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  {slip.status === "CANCELLED"
                    ? `This slip was cancelled, so its collections went back to Collections on hand. The ${formatCurrency(slip.grandTotal)} is the total recorded when the slip was prepared, not a current balance.`
                    : `No collection rows are linked to this slip. The ${formatCurrency(slip.grandTotal)} is the total recorded on the slip.`}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">Type</TableHead>
                        <TableHead className="min-w-[150px]">Reference / check no.</TableHead>
                        <TableHead className="min-w-[160px]">Customer</TableHead>
                        <TableHead className="w-[110px] whitespace-nowrap">Collected</TableHead>
                        <TableHead className="w-[120px] text-right whitespace-nowrap">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.collectionInvoiceId}>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[11px] font-semibold ${toneClass(item.assetType === "CASH" ? "success" : "info")}`}
                            >
                              {item.assetType === "CASH" ? "Cash" : "Check"}
                            </Badge>
                            {item.checkStatus ? (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {item.checkStatus === "RETURNED" ? "Bounced" : item.checkStatus.replace(/_/g, " ").toLowerCase()}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm">
                            <p className="truncate font-mono" title={item.documentNumber}>
                              {item.documentNumber}
                            </p>
                            {item.checkNo ? (
                              <p className="truncate text-[11px] text-muted-foreground" title={item.checkNo}>
                                Check {item.checkNo}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm">
                            {item.customer ? (
                              <p className="truncate" title={item.customer}>
                                {item.customer}
                              </p>
                            ) : (
                              <p className="text-muted-foreground">—</p>
                            )}
                            {item.customerCode && item.customerCode !== item.customer ? (
                              <p className="truncate font-mono text-[11px] text-muted-foreground" title={item.customerCode}>
                                {item.customerCode}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-sm">
                            {item.collectionDate ? phtDisplayDate(item.collectionDate) : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
                            {formatCurrency(item.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {cancellable && confirming && (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <Label htmlFor="cancel-reason" className="text-sm">
                  Cancellation reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="cancel-reason"
                  rows={2}
                  className="min-h-[100px] resize-none"
                  maxLength={300}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {depositable
                    ? "Cancelling reverses both postings (cash and checks) and returns the checks to the vault."
                    : "The collections go back to Collections on hand and the slip is kept for the trail."}
                </p>
                {touched && reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
              </div>
            )}
          </div>

          <DialogFooter className="border-t bg-muted/20 px-6 py-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Close
              </Button>
            </DialogClose>
            {depositable && !confirming && (
              <span
                className="inline-flex"
                title={handoverNo.trim() ? undefined : "Enter the slip or validation number the bank stamped."}
              >
                <Button
                  type="button"
                  disabled={isSaving || !handoverNo.trim()}
                  onClick={handleDeposit}
                >
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Mark as deposited
                </Button>
              </span>
            )}
            {cancellable && !confirming && (
              <Button type="button" variant="outline" disabled={isSaving} onClick={() => setConfirming(true)}>
                Cancel slip
              </Button>
            )}
            {cancellable && confirming && (
              <Button type="button" variant="destructive" disabled={isSaving} onClick={handleCancel}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cancel this slip
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
