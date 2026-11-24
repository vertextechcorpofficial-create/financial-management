"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

import {
  BUCKET_LABEL,
  PAYMENT_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
} from "../constants";
import { mdy, phtDisplayStamp } from "../pht";
import { fetchPayment, reversePayment } from "../providers/paymentsApi";
import type { AllocationRow, PaymentListRow } from "../types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  paymentId: number | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export function PaymentDetailDialog({ paymentId, onOpenChange, onChanged }: Props) {
  const [payment, setPayment] = useState<PaymentListRow | null>(null);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [reversible, setReversible] = useState<{ allowed: boolean; reason: string | null }>({
    allowed: false,
    reason: null,
  });
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

  const moneyOut = payment ? payment.amount + payment.bank_charge : 0;

  return (
    <Dialog open={paymentId !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[800px]"
      >
        <DialogHeader className="space-y-2 border-b border-border px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle className="line-clamp-1">{payment?.payment_no ?? "Payment"}</DialogTitle>
            {payment ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge tone={PAYMENT_STATUS_TONE[payment.status]}>
                  {PAYMENT_STATUS_LABEL[payment.status]}
                </StatusBadge>
                <StatusBadge tone="neutral">{PAYMENT_METHOD_LABEL[payment.method]}</StatusBadge>
                <StatusBadge tone="info">{PAYMENT_KIND_LABEL[payment.kind]}</StatusBadge>
              </div>
            ) : null}
          </div>
          <DialogDescription className="text-xs">
            What this payment covered and the entry it posted.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!payment && !error ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}

          {payment ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Tile label="Amount" value={formatCurrency(payment.amount)} />
                <Tile
                  label="Penalty"
                  value={payment.charge_amount > 0 ? formatCurrency(payment.charge_amount) : "none"}
                />
                <Tile label="Bank charge" value={payment.bank_charge > 0 ? formatCurrency(payment.bank_charge) : "none"} />
                <Tile label="Money out" value={formatCurrency(moneyOut)} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Group title="Payment">
                  <Row
                    label="Loan"
                    value={`${payment.loan_no ?? "not recorded"}${payment.lenderName ? ` · ${payment.lenderName}` : ""}`}
                  />
                  <Row label="Paid on" value={mdy(payment.payment_date)} />
                  <Row label="From" value={payment.accountLabel ?? "not recorded"} />
                  <Row label="Lender receipt" value={payment.lender_receipt ?? "not recorded"} />
                  {payment.method === "CHECK" ? (
                    <>
                      <Row label="Check number" value={payment.check_no ?? "not recorded"} />
                      <Row label="Check date" value={payment.check_date ? mdy(payment.check_date) : "not recorded"} />
                    </>
                  ) : null}
                </Group>

                <Group title="Posting">
                  <Row label="Journal entry" value={payment.entryNo ?? "not posted"} />
                  <Row label="Recorded" value={phtDisplayStamp(payment.created_at)} />
                  <Row
                    label="Reversal"
                    value={reversible.allowed ? "Allowed" : (reversible.reason ?? "Not available")}
                    title={reversible.reason ?? undefined}
                  />
                  <Row label="Remarks" value={payment.remarks ?? "none"} title={payment.remarks ?? undefined} />
                </Group>
              </div>

              <div className="overflow-hidden rounded-lg border border-border/60">
                <h3 className="border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Where the money went
                </h3>
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Bucket</th>
                      <th className="px-4 py-2 text-right font-medium">Installment</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {allocations.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted-foreground">
                          Nothing is allocated on this payment.
                        </td>
                      </tr>
                    ) : (
                      allocations.map((line) => (
                        <tr key={line.id}>
                          <td className="px-4 py-2">{BUCKET_LABEL[line.bucket]}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                            {line.installment_id ? `#${line.installment_id}` : "unapplied"}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(line.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Close
          </Button>
          {payment && payment.status === "POSTED" ? (
            <div className="flex flex-col items-end gap-1">
              {reversible.allowed ? null : (
                <p id="reverse-blocked" className="max-w-[320px] text-right text-xs text-muted-foreground">
                  {reversible.reason ?? "This payment cannot be reversed."}
                </p>
              )}
              {/* A blocked control says so in its own attributes, and stops wearing the loudest colour. */}
              <Button
                type="button"
                variant={reversible.allowed ? "destructive" : "outline"}
                aria-disabled={isSaving || !reversible.allowed}
                aria-describedby={reversible.allowed || !reversible.reason ? undefined : "reverse-blocked"}
                title={reversible.allowed ? undefined : (reversible.reason ?? "This payment cannot be reversed.")}
                className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                onClick={() => {
                  if (isSaving || !reversible.allowed) return;
                  void reverse();
                }}
              >
                {isSaving ? "Reversing…" : "Reverse payment"}
              </Button>
            </div>
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
      <dd className="min-w-0 truncate text-right tabular-nums" title={title ?? value}>
        {value}
      </dd>
    </div>
  );
}
