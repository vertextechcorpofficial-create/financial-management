"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

import { BUCKET_LABEL, PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "../constants";
import { phtDisplayStamp } from "../pht";
import { fetchPayment, reversePayment } from "../providers/paymentsApi";
import type { AllocationRow, PaymentListRow } from "../types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  paymentId: number | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  );
}

export function PaymentDetailDialog({ paymentId, onOpenChange, onChanged }: Props) {
  const [payment, setPayment] = useState<PaymentListRow | null>(null);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [reversible, setReversible] = useState<{ allowed: boolean; reason: string | null }>({ allowed: false, reason: null });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!paymentId) {
      setPayment(null);
      setAllocations([]);
      setReversible({ allowed: false, reason: null });
      setError(null);
      return;
    }
    let cancelled = false;
    fetchPayment(paymentId)
      .then((payload) => {
        if (cancelled) return;
        setPayment(payload.payment);
        setAllocations(payload.allocations);
        setReversible(payload.reversible);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "That payment could not be read.");
      });
    return () => {
      cancelled = true;
    };
  }, [paymentId]);

  async function reverse() {
    if (!payment) return;
    setIsSaving(true);
    try {
      await reversePayment(payment.id);
      toast.success(`${payment.payment_no} reversed. The schedule went back to what it was.`);
      onChanged();
      onOpenChange(false);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "The payment could not be reversed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={paymentId !== null} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[760px]">
        <div className="flex max-h-[85vh] flex-col overflow-hidden">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="line-clamp-1">{payment?.payment_no ?? "Payment"}</DialogTitle>
            <DialogDescription>What this payment covered and the entry it posted.</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {!payment && !error ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : null}

            {payment ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={PAYMENT_STATUS_TONE[payment.status]}>{PAYMENT_STATUS_LABEL[payment.status]}</StatusBadge>
                  <StatusBadge tone="neutral">{PAYMENT_METHOD_LABEL[payment.method]}</StatusBadge>
                  <StatusBadge tone="info">{PAYMENT_KIND_LABEL[payment.kind]}</StatusBadge>
                </div>

                <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                  <Detail label="Loan">{payment.loan_no ?? "—"}{payment.lenderName ? ` · ${payment.lenderName}` : ""}</Detail>
                  <Detail label="Paid on">{payment.payment_date}</Detail>
                  <Detail label="Amount">{formatCurrency(payment.amount)}</Detail>
                  <Detail label="Penalty charged">{payment.charge_amount > 0 ? formatCurrency(payment.charge_amount) : "—"}</Detail>
            <Detail label="Bank charge">
              {payment.bank_charge > 0 ? formatCurrency(payment.bank_charge) : "—"}
            </Detail>
            <Detail label="Money out">{formatCurrency(payment.amount + payment.bank_charge)}</Detail>
                  <Detail label="From">{payment.accountLabel ?? "—"}</Detail>
                  <Detail label="Lender receipt">{payment.lender_receipt ?? "—"}</Detail>
                  {payment.method === "CHECK" ? (
                    <>
                      <Detail label="Check no">{payment.check_no ?? "—"}</Detail>
                      <Detail label="Check date">{payment.check_date ?? "—"}</Detail>
                    </>
                  ) : null}
                  <Detail label="Journal entry">{payment.entryNo ?? "—"}</Detail>
                  <Detail label="Recorded">{phtDisplayStamp(payment.created_at)}</Detail>
                </dl>

                <div>
                  <h3 className="mb-2 text-sm font-medium">Where the money went</h3>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Bucket</th>
                          <th className="px-3 py-2 text-left font-medium">Installment</th>
                          <th className="px-3 py-2 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {allocations.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                              Nothing is allocated on this payment.
                            </td>
                          </tr>
                        ) : (
                          allocations.map((line) => (
                            <tr key={line.id}>
                              <td className="px-3 py-2">{BUCKET_LABEL[line.bucket]}</td>
                              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                                {line.installment_id ? `#${line.installment_id}` : "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(line.amount)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {payment.remarks ? <p className="text-sm text-muted-foreground">{payment.remarks}</p> : null}
              </>
            ) : null}
          </div>

          <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Close
            </Button>
            {payment && payment.status === "POSTED" ? (
              <span title={reversible.allowed ? undefined : reversible.reason ?? undefined} className="inline-flex">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void reverse()}
                  disabled={isSaving || !reversible.allowed}
                >
                  {isSaving ? "Reversing…" : "Reverse payment"}
                </Button>
              </span>
            ) : null}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
