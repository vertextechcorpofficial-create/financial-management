"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";

import { PAYMENT_KINDS, PAYMENT_KIND_LABEL, PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "../constants";
import { fetchPaymentContext, recordPayment } from "../providers/paymentsApi";
import { phtDate } from "../pht";
import type { PaymentAccountRow, PaymentContext, PaymentMethod } from "../types";
import { DateField } from "./DateField";
import { OptionCombobox } from "./OptionCombobox";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loans: Array<{ id: number; loanNo: string; lenderName: string; installmentAmount: number }>;
  onRecorded: () => void;
}

interface FormState {
  loanId: number | null;
  paymentDate: string;
  amount: string;
  accountId: number | null;
  method: PaymentMethod;
  kind: "NORMAL" | "CATCH_UP";
  checkNo: string;
  checkDate: string;
  lenderReceipt: string;
  remarks: string;
}

const blank = (): FormState => ({
  loanId: null,
  paymentDate: phtDate(),
  amount: "",
  accountId: null,
  method: "TRANSFER",
  kind: "NORMAL",
  checkNo: "",
  checkDate: "",
  lenderReceipt: "",
  remarks: "",
});

export function RecordPaymentDialog({ open, onOpenChange, loans, onRecorded }: Props) {
  const [form, setForm] = useState<FormState>(blank);
  const [context, setContext] = useState<PaymentContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(blank());
      setContext(null);
      setContextError(null);
      setErrors({});
      setIsSaving(false);
    }
  }, [open]);

  useEffect(() => {
    if (!form.loanId) {
      setContext(null);
      return;
    }
    let cancelled = false;
    setContextError(null);
    fetchPaymentContext(form.loanId)
      .then((payload) => {
        if (cancelled) return;
        setContext(payload);
        setForm((current) => ({
          ...current,
          amount: current.amount || (payload.suggested > 0 ? payload.suggested.toFixed(2) : ""),
          accountId: current.accountId ?? payload.accounts[0]?.id ?? null,
        }));
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setContext(null);
        setContextError(caught instanceof Error ? caught.message : "The loan could not be read.");
      });
    return () => {
      cancelled = true;
    };
  }, [form.loanId]);

  const accounts: PaymentAccountRow[] = context?.accounts ?? [];
  const needsCheck = form.method === "CHECK";

  // What the chosen channel adds on top of the installment, so the payer sees the money out.
  const chosenAccount = accounts.find((account) => account.id === form.accountId) ?? null;
  const enteredAmount = Number(form.amount.replace(/,/g, "")) || 0;
  const bankCharge =
    chosenAccount && chosenAccount.charge_pct > 0 && enteredAmount > 0
      ? Math.round(((enteredAmount * chosenAccount.charge_pct) / 100) * 100) / 100
      : 0;

  // A submit button that rejects everything the desk types is worse than one that says what is missing.
  const missing = [
    !form.loanId ? "choose the loan" : null,
    !form.paymentDate ? "pick the payment date" : null,
    !(Number(form.amount.replace(/,/g, "")) > 0) ? "enter the amount" : null,
    !form.accountId ? "choose the account" : null,
    needsCheck && !form.checkNo.trim() ? "enter the check number" : null,
    needsCheck && !form.checkDate ? "pick the check date" : null,
  ].filter(Boolean) as string[];
  const canSubmit = missing.length === 0 && loans.length > 0;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.loanId) next.loanId = "Choose the loan being paid.";
    if (!form.paymentDate) next.paymentDate = "Pick the payment date.";
    const amount = Number(form.amount.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) next.amount = "Enter an amount above zero.";
    if (!form.accountId) next.accountId = "Choose the account the money came from.";
    if (needsCheck) {
      if (!form.checkNo.trim()) next.checkNo = "Enter the check number.";
      if (!form.checkDate) next.checkDate = "Pick the check date.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) toast.error("Some fields need attention.");
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setIsSaving(true);
    try {
      const created = await recordPayment({
        loanId: form.loanId as number,
        paymentDate: form.paymentDate,
        amount: Number(form.amount.replace(/,/g, "")),
        accountId: form.accountId as number,
        method: form.method,
        kind: form.kind,
        checkNo: needsCheck ? form.checkNo.trim() : undefined,
        checkDate: needsCheck ? form.checkDate : undefined,
        lenderReceipt: form.lenderReceipt.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
      });
      toast.success(`${created.payment_no} recorded.`);
      onRecorded();
      onOpenChange(false);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "The payment could not be recorded.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[720px]">
        <div className="flex max-h-[85vh] flex-col overflow-hidden">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>Record loan payment</DialogTitle>
            <DialogDescription>
              Penalties are covered first, then interest, then principal, oldest installment first.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="payment-loan">Loan <span className="text-destructive">*</span></Label>
              <OptionCombobox
                value={form.loanId ? String(form.loanId) : ""}
                onChange={(value) => setForm((current) => ({ ...current, loanId: value ? Number(value) : null, amount: "" }))}
                placeholder="Choose a loan"
                searchPlaceholder="Search loan no or lender"
                emptyLabel="No open loan found."
                options={loans.map((loan) => ({
                  value: String(loan.id),
                  label: `${loan.loanNo} · ${loan.lenderName}`,
                  searchText: `${loan.loanNo} ${loan.lenderName}`,
                  description: `Installment ${formatCurrency(loan.installmentAmount)}`,
                }))}
              />
              {errors.loanId ? <p className="text-xs text-destructive">{errors.loanId}</p> : null}
            </div>

            {contextError ? <p className="text-sm text-destructive">{contextError}</p> : null}

            {context ? (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">Next due</span>
                  <span className="tabular-nums">
                    {context.suggested > 0 ? formatCurrency(context.suggested) : "Nothing left to pay"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">Payoff today</span>
                  <span className="tabular-nums">{formatCurrency(context.payoff)}</span>
                </div>
                {context.loan.advance_balance > 0 ? (
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">Advance held</span>
                    <span className="tabular-nums">{formatCurrency(context.loan.advance_balance)}</span>
                  </div>
                ) : null}
                {context.notices.map((notice) => (
                  <p key={notice} className="mt-2 text-xs text-muted-foreground">
                    {notice}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payment-date">Payment date <span className="text-destructive">*</span></Label>
                <DateField
                  id="payment-date"
                  value={form.paymentDate}
                  onChange={(value) => setForm((current) => ({ ...current, paymentDate: value }))}
                  maxDate={phtDate()}
                  inDialog
                />
                {errors.paymentDate ? <p className="text-xs text-destructive">{errors.paymentDate}</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment-amount">Amount <span className="text-destructive">*</span></Label>
                <Input
                  id="payment-amount"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                  aria-invalid={errors.amount ? true : undefined}
                  className="h-9 tabular-nums"
                />
                {errors.amount ? <p className="text-xs text-destructive">{errors.amount}</p> : null}
                {bankCharge > 0 && chosenAccount ? (
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    {chosenAccount.name} charges {chosenAccount.charge_pct}% · {formatCurrency(bankCharge)} on top, so
                    the money out is {formatCurrency(Math.round((enteredAmount + bankCharge) * 100) / 100)}.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment-account">Paid from <span className="text-destructive">*</span></Label>
                <OptionCombobox
                  value={form.accountId ? String(form.accountId) : ""}
                  onChange={(value) => setForm((current) => ({ ...current, accountId: Number(value) }))}
                  placeholder="Choose an account"
                  searchPlaceholder="Search account"
                  emptyLabel="No payment account is set up."
                  className="h-9 w-full justify-between"
                  options={accounts.map((account) => ({
                    value: String(account.id),
                    label: account.name,
                    description: account.charge_pct > 0 ? `${account.charge_pct}% charge` : undefined,
                  }))}
                />
                {errors.accountId ? <p className="text-xs text-destructive">{errors.accountId}</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment-method">Method</Label>
                <Select
                  value={form.method}
                  onValueChange={(value) => setForm((current) => ({ ...current, method: value as PaymentMethod }))}
                >
                  <SelectTrigger id="payment-method" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {PAYMENT_METHOD_LABEL[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {needsCheck ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="payment-check-no">Check number</Label>
                    <Input
                      id="payment-check-no"
                      value={form.checkNo}
                      onChange={(event) => setForm((current) => ({ ...current, checkNo: event.target.value }))}
                      aria-invalid={errors.checkNo ? true : undefined}
                      className="h-9"
                    />
                    {errors.checkNo ? <p className="text-xs text-destructive">{errors.checkNo}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="payment-check-date">Check date</Label>
                    <DateField
                      id="payment-check-date"
                      value={form.checkDate}
                      onChange={(value) => setForm((current) => ({ ...current, checkDate: value }))}
                      inDialog
                    />
                    {errors.checkDate ? <p className="text-xs text-destructive">{errors.checkDate}</p> : null}
                  </div>
                </>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="payment-kind">Kind</Label>
                <Select
                  value={form.kind}
                  onValueChange={(value) => setForm((current) => ({ ...current, kind: value as "NORMAL" | "CATCH_UP" }))}
                >
                  <SelectTrigger id="payment-kind" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {PAYMENT_KIND_LABEL[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment-receipt">Lender receipt</Label>
                <Input
                  id="payment-receipt"
                  value={form.lenderReceipt}
                  onChange={(event) => setForm((current) => ({ ...current, lenderReceipt: event.target.value }))}
                  placeholder="Optional"
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-remarks">Remarks</Label>
              <Textarea
                id="payment-remarks"
                value={form.remarks}
                onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={isSaving || !canSubmit}
              title={loans.length === 0 ? "No open loan can take a payment yet." : canSubmit ? undefined : `Still to do: ${missing.join(", ")}.`}
            >
              {isSaving ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
