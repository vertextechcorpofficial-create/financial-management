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
import { Notice } from "./Notice";
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

const money = (value: number) => formatCurrency(Math.abs(value) < 0.005 ? 0 : value);

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
  const moneyOut = Math.round((enteredAmount + bankCharge) * 100) / 100;

  const nextDue = context?.installments.find((row) => row.totalOutstanding > 0.005) ?? null;
  const amountCovers = nextDue ? enteredAmount >= nextDue.totalOutstanding - 0.005 : false;

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

  const subtitle = context
    ? `${context.loan.loan_no} · ${context.loan.lender_name} · installment ${money(context.loan.installment_amount)}`
    : "Choose the loan this money is for.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[720px]">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4">
          <DialogTitle className="truncate">Record payment</DialogTitle>
          <DialogDescription className="truncate">{subtitle}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Amount" value={enteredAmount > 0 ? money(enteredAmount) : "—"} />
            <Tile label="Bank charge" value={bankCharge > 0 ? money(bankCharge) : "—"} />
            <Tile label="Money out" value={moneyOut > 0 ? money(moneyOut) : "—"} />
            <Tile label="Next due" value={nextDue ? money(nextDue.totalOutstanding) : context ? "Nothing left" : "—"} />
          </div>

          {context ? (
            <Notice
              tone={amountCovers ? "info" : "warning"}
              title={amountCovers ? "This covers the next installment" : "This does not cover the next installment"}
            >
              {nextDue
                ? `${money(nextDue.totalOutstanding)} is due on ${nextDue.paymentDueDate}${nextDue.overdue ? ", already past its due date" : ""}. The oldest installment takes the money first, so this pays ${amountCovers ? "it in full" : "into it and leaves a balance"}${bankCharge > 0 && chosenAccount ? `; ${chosenAccount.name} adds ${money(bankCharge)} on top` : ""}.`
                : "Every installment on this loan is settled, so anything recorded now is held as an advance."}
            </Notice>
          ) : null}

          {contextError ? (
            <Notice tone="danger" title="The loan could not be read">
              {contextError}
            </Notice>
          ) : null}

          <Group title="Payment">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="payment-loan">
                Loan <span className="text-destructive">*</span>
              </Label>
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

            <Field label="Payment date" required error={errors.paymentDate} htmlFor="payment-date">
              <DateField
                id="payment-date"
                value={form.paymentDate}
                onChange={(value) => setForm((current) => ({ ...current, paymentDate: value }))}
                maxDate={phtDate()}
                inDialog
              />
            </Field>

            <Field label="Amount" required error={errors.amount} htmlFor="payment-amount">
              <Input
                id="payment-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                aria-invalid={errors.amount ? true : undefined}
                className="h-9 tabular-nums"
              />
            </Field>

            <Field label="Paid from" required error={errors.accountId} htmlFor="payment-account">
              <OptionCombobox
                value={form.accountId ? String(form.accountId) : ""}
                onChange={(value) => setForm((current) => ({ ...current, accountId: Number(value) }))}
                placeholder="Choose an account"
                searchPlaceholder="Search account"
                emptyLabel={form.loanId ? "No payment account is active." : "Choose a loan first."}
                className="h-9 w-full justify-between"
                options={accounts.map((account) => ({
                  value: String(account.id),
                  label: account.name,
                  description: account.charge_pct > 0 ? `${account.charge_pct}% charge` : undefined,
                }))}
              />
            </Field>
          </Group>

          <Group title="Method and reference">
            <Field label="Method" htmlFor="payment-method">
              <Select
                value={form.method}
                onValueChange={(value) => setForm((current) => ({ ...current, method: value as PaymentMethod }))}
              >
                <SelectTrigger id="payment-method" className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {PAYMENT_METHOD_LABEL[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Kind" htmlFor="payment-kind">
              <Select
                value={form.kind}
                onValueChange={(value) => setForm((current) => ({ ...current, kind: value as "NORMAL" | "CATCH_UP" }))}
              >
                <SelectTrigger id="payment-kind" className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                  {PAYMENT_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {PAYMENT_KIND_LABEL[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {needsCheck ? (
              <>
                <Field label="Check number" required error={errors.checkNo} htmlFor="payment-check-no">
                  <Input
                    id="payment-check-no"
                    value={form.checkNo}
                    onChange={(event) => setForm((current) => ({ ...current, checkNo: event.target.value }))}
                    aria-invalid={errors.checkNo ? true : undefined}
                    className="h-9"
                  />
                </Field>
                <Field label="Check date" required error={errors.checkDate} htmlFor="payment-check-date">
                  <DateField
                    id="payment-check-date"
                    value={form.checkDate}
                    onChange={(value) => setForm((current) => ({ ...current, checkDate: value }))}
                    inDialog
                  />
                </Field>
              </>
            ) : null}

            <Field label="Lender receipt" htmlFor="payment-receipt">
              <Input
                id="payment-receipt"
                value={form.lenderReceipt}
                onChange={(event) => setForm((current) => ({ ...current, lenderReceipt: event.target.value }))}
                placeholder="Optional"
                className="h-9"
              />
            </Field>
          </Group>

          <Group title="Notes">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="payment-remarks">Remarks</Label>
              <Textarea
                id="payment-remarks"
                value={form.remarks}
                onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
                rows={2}
              />
            </div>
          </Group>
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
      </DialogContent>
    </Dialog>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/60">
      <div className="border-b border-border/60 bg-muted/20 px-4 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</p>
      </div>
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  error,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
