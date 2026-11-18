"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";

import {
  CHANGE_KINDS,
  CHANGE_KIND_HINT,
  CHANGE_KIND_LABEL,
  PREPAYMENT_OPTION_LABEL,
  PREPAYMENT_OPTIONS,
} from "../constants";
import { phtDate } from "../pht";
import { fetchChangeContext, recordChangeRequest } from "../providers/changesApi";
import { outstandingPrincipal, planChange } from "../services/changePlan";
import type { ChangeContext, ChangeKind, PrepaymentOption } from "../types";
import { DateField } from "./DateField";
import { Notice } from "./Notice";
import { OptionCombobox } from "./OptionCombobox";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loans: Array<{ id: number; loanNo: string; lenderName: string }>;
  onRecorded: () => void;
}

interface FormState {
  loanId: number | null;
  kind: ChangeKind;
  effectiveDate: string;
  amount: string;
  prepaymentOption: PrepaymentOption;
  newRate: string;
  newTermPayments: string;
  penaltyRate: string;
  accountId: number | null;
  notes: string;
}

const blank = (): FormState => ({
  loanId: null,
  kind: "PREPAYMENT",
  effectiveDate: phtDate(),
  amount: "",
  prepaymentOption: "SHORTEN_TERM",
  newRate: "",
  newTermPayments: "",
  penaltyRate: "0",
  accountId: null,
  notes: "",
});

const toNumber = (raw: string): number | null => {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
};

export function RecordChangeDialog({ open, onOpenChange, loans, onRecorded }: Props) {
  const [form, setForm] = useState<FormState>(blank);
  const [context, setContext] = useState<ChangeContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [contextAttempt, setContextAttempt] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(blank());
      setContext(null);
      setContextError(null);
      setIsLoadingContext(false);
      setErrors({});
      setIsSaving(false);
    }
  }, [open]);

  useEffect(() => {
    if (!form.loanId) {
      setContext(null);
      setContextError(null);
      setIsLoadingContext(false);
      return;
    }
    let cancelled = false;
    setContextError(null);
    setIsLoadingContext(true);
    fetchChangeContext(form.loanId)
      .then((payload) => {
        if (cancelled) return;
        setContext(payload);
        setForm((current) => ({
          ...current,
          accountId: current.accountId ?? payload.accounts[0]?.id ?? null,
        }));
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setContext(null);
        setContextError(caught instanceof Error ? caught.message : "That loan could not be read.");
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingContext(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.loanId, contextAttempt]);

  /**
   * The preview runs the same planner the route writes with, in the browser: the installment,
   * maturity and gain or loss under the fields are the figures that will be saved.
   */
  const preview = useMemo(() => {
    if (!context) return null;
    return planChange({
      loan: context.loan,
      schedule: context.schedule,
      kind: form.kind,
      effectiveDate: form.effectiveDate,
      amount: toNumber(form.amount),
      prepaymentOption: form.kind === "PREPAYMENT" ? form.prepaymentOption : null,
      newRate: toNumber(form.newRate),
      newTermPayments: toNumber(form.newTermPayments),
      penaltyRate: toNumber(form.penaltyRate) ?? 0,
    });
  }, [context, form]);

  const needsMoney = form.kind === "PREPAYMENT" || form.kind === "PAYOFF";
  const selectedLoanLabel = loans.find((loan) => loan.id === form.loanId)?.loanNo ?? "this loan";
  const isBlocked = context !== null && !context.canChange;
  // A rate this far from any real borrowing is a typo, not a repricing. The route refuses it too.
  const rateInRange = !(form.kind === "RATE_CHANGE" || form.kind === "RESTRUCTURE") || (toNumber(form.newRate) ?? 0) <= 30;
  const canSubmit =
    !isSaving &&
    !isLoadingContext &&
    context !== null &&
    !isBlocked &&
    rateInRange &&
    preview !== null &&
    preview.plan !== null &&
    (!needsMoney || form.accountId !== null);

  /** Said on the submit button while it is disabled, so a dead control explains itself. */
  const submitReason = isSaving
    ? "Saving this change."
    : isLoadingContext
      ? "Still reading the loan's schedule and payoff quote."
      : contextError
        ? "The loan could not be read, so nothing can be recorded yet. Try again above."
        : !form.loanId
          ? "Choose the loan being changed first."
          : isBlocked
            ? context.blockedReason ?? "This loan cannot be changed."
            : !rateInRange
              ? "A rate above 30% a year is almost certainly a typo."
              : preview?.error
                ? preview.error
                : !preview?.plan
                  ? "Fill the fields until the preview can be planned."
                  : "Choose the account the money moves through.";

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.loanId) next.loanId = "Choose the loan being changed.";
    if (!form.effectiveDate) next.effectiveDate = "Pick the date the change takes effect.";
    if (needsMoney && !form.accountId) next.accountId = "Choose the account the money moves through.";
    if (form.kind === "PREPAYMENT" && (toNumber(form.amount) ?? 0) <= 0) next.amount = "Enter the amount being prepaid.";
    if ((form.kind === "RATE_CHANGE" || form.kind === "RESTRUCTURE") && (toNumber(form.newRate) ?? 0) <= 0) {
      next.newRate = "Enter the new rate.";
    } else if (
      (form.kind === "RATE_CHANGE" || form.kind === "RESTRUCTURE") &&
      (toNumber(form.newRate) ?? 0) > 30
    ) {
      next.newRate = "A rate above 30% a year is almost certainly a typo.";
    }
    if (form.kind === "RESTRUCTURE" && (toNumber(form.newTermPayments) ?? 0) <= 0) {
      next.newTermPayments = "Enter how many installments the new terms should run for.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    if (!canSubmit) {
      if (preview?.error) toast.error(preview.error);
      return;
    }
    setIsSaving(true);
    try {
      const created = await recordChangeRequest({
        loanId: form.loanId as number,
        kind: form.kind,
        effectiveDate: form.effectiveDate,
        amount: form.kind === "PREPAYMENT" ? toNumber(form.amount) : null,
        prepaymentOption: form.kind === "PREPAYMENT" ? form.prepaymentOption : null,
        newRate: form.kind === "PREPAYMENT" || form.kind === "PAYOFF" ? null : toNumber(form.newRate),
        newTermPayments: form.kind === "RESTRUCTURE" ? toNumber(form.newTermPayments) : null,
        penaltyRate: toNumber(form.penaltyRate),
        accountId: needsMoney ? form.accountId : null,
        notes: form.notes.trim() || null,
      });
      toast.success(`${created.changeNo} recorded${created.scheduleVersion ? ` on schedule version ${created.scheduleVersion}` : ""}.`);
      onRecorded();
      onOpenChange(false);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "The change could not be recorded.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[760px]">
        <div className="flex max-h-[85vh] flex-col overflow-hidden">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>Record a change</DialogTitle>
            <DialogDescription>
              A change rewrites the remaining installments as a new schedule version and keeps the paid ones untouched.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="change-loan">Loan</Label>
                <OptionCombobox
                  value={form.loanId ? String(form.loanId) : ""}
                  onChange={(value) => setForm((current) => ({ ...current, loanId: value ? Number(value) : null }))}
                  placeholder="Choose a loan"
                  searchPlaceholder="Search loan no or lender"
                  emptyLabel="No open loan found."
                  options={loans.map((loan) => ({
                    value: String(loan.id),
                    label: `${loan.loanNo} · ${loan.lenderName}`,
                    searchText: `${loan.loanNo} ${loan.lenderName}`,
                  }))}
                />
                {errors.loanId ? <p className="text-xs text-destructive">{errors.loanId}</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="change-kind">Kind</Label>
                <Select value={form.kind} onValueChange={(value) => setForm((current) => ({ ...current, kind: value as ChangeKind }))}>
                  <SelectTrigger id="change-kind" className="h-9 w-full">
                    <SelectValue placeholder="Choose the kind" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                    {CHANGE_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {CHANGE_KIND_LABEL[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{CHANGE_KIND_HINT[form.kind]}</p>
              </div>
            </div>

            {isLoadingContext ? (
              <div className="space-y-2" aria-live="polite">
                <Notice tone="info" title="Reading the loan">
                  Reading {selectedLoanLabel}&rsquo;s schedule and current payoff quote. The figures and the preview appear
                  as soon as it answers.
                </Notice>
                <div className="space-y-1.5">
                  <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-56 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-48 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ) : null}

            {contextError ? (
              <Notice tone="danger" title="Could not read this loan">
                <p>
                  The schedule and payoff quote did not come back, so nothing can be recorded yet. {contextError}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setContextAttempt((attempt) => attempt + 1)}
                >
                  Try again
                </Button>
              </Notice>
            ) : null}

            {context ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">Outstanding principal</span>
                    <span className="tabular-nums">{formatCurrency(outstandingPrincipal(context.schedule))}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">Installment · maturity</span>
                    <span className="tabular-nums">
                      {formatCurrency(context.loan.installmentAmount)} · {context.loan.maturityDate ?? "—"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">Payoff today</span>
                    <span className="tabular-nums">{formatCurrency(context.payoff)}</span>
                  </div>
                </div>

                {context.notices.map((notice) => (
                  <Notice key={notice} tone={context.canChange ? "info" : "warning"}>
                    {notice}
                  </Notice>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="change-date">Effective date</Label>
                <DateField
                  id="change-date"
                  value={form.effectiveDate}
                  onChange={(value) => setForm((current) => ({ ...current, effectiveDate: value }))}
                  inDialog
                />
                {errors.effectiveDate ? <p className="text-xs text-destructive">{errors.effectiveDate}</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="change-penalty">Prepayment penalty rate (%)</Label>
                <Input
                  id="change-penalty"
                  inputMode="decimal"
                  value={form.penaltyRate}
                  onChange={(event) => setForm((current) => ({ ...current, penaltyRate: event.target.value }))}
                  className="h-9 tabular-nums"
                  disabled={form.kind === "RATE_CHANGE"}
                />
                <p className="text-xs text-muted-foreground">Only when the lender charges one. Leave 0 for none.</p>
              </div>

              {form.kind === "PREPAYMENT" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="change-amount">Amount prepaid</Label>
                    <Input
                      id="change-amount"
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                      aria-invalid={errors.amount ? true : undefined}
                      className="h-9 tabular-nums"
                    />
                    {errors.amount ? <p className="text-xs text-destructive">{errors.amount}</p> : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="change-option">What the prepayment buys</Label>
                    <Select
                      value={form.prepaymentOption}
                      onValueChange={(value) =>
                        setForm((current) => ({ ...current, prepaymentOption: value as PrepaymentOption }))
                      }
                    >
                      <SelectTrigger id="change-option" className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                        {PREPAYMENT_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {PREPAYMENT_OPTION_LABEL[option]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}

              {form.kind === "RATE_CHANGE" || form.kind === "RESTRUCTURE" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="change-rate">New rate (%)</Label>
                  <Input
                    id="change-rate"
                    inputMode="decimal"
                    value={form.newRate}
                    onChange={(event) => setForm((current) => ({ ...current, newRate: event.target.value }))}
                    aria-invalid={errors.newRate ? true : undefined}
                    className="h-9 tabular-nums"
                  />
                  {errors.newRate ? <p className="text-xs text-destructive">{errors.newRate}</p> : null}
                </div>
              ) : null}

              {form.kind === "RESTRUCTURE" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="change-term">Installments to run</Label>
                  <Input
                    id="change-term"
                    inputMode="numeric"
                    value={form.newTermPayments}
                    onChange={(event) => setForm((current) => ({ ...current, newTermPayments: event.target.value }))}
                    aria-invalid={errors.newTermPayments ? true : undefined}
                    className="h-9 tabular-nums"
                  />
                  {errors.newTermPayments ? <p className="text-xs text-destructive">{errors.newTermPayments}</p> : null}
                </div>
              ) : null}

              {needsMoney && context ? (
                <div className="space-y-1.5">
                  <Label htmlFor="change-account">Money account</Label>
                  <OptionCombobox
                    value={form.accountId ? String(form.accountId) : ""}
                    onChange={(value) => setForm((current) => ({ ...current, accountId: Number(value) }))}
                    placeholder="Choose an account"
                    searchPlaceholder="Search account"
                    emptyLabel="No payment account is set up."
                    className="h-9 w-full justify-between"
                    options={context.accounts.map((account) => ({
                      value: String(account.id),
                      label: `${account.name} · ${account.label}`,
                      searchText: `${account.name} ${account.label}`,
                    }))}
                  />
                  {errors.accountId ? <p className="text-xs text-destructive">{errors.accountId}</p> : null}
                </div>
              ) : null}

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="change-notes">Notes</Label>
                <Textarea
                  id="change-notes"
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Why the borrower asked, or the reference of the letter"
                  rows={2}
                  className="min-h-[80px] resize-none"
                />
              </div>
            </div>

            {preview ? (
              preview.plan ? (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Before and after</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Installment</span>
                      <span className="tabular-nums">
                        {formatCurrency(preview.plan.oldInstallment)} → {formatCurrency(preview.plan.newInstallment)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Maturity</span>
                      <span className="tabular-nums">
                        {preview.plan.oldMaturity ?? "—"} → {preview.plan.newMaturity ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Principal after</span>
                      <span className="tabular-nums">{formatCurrency(preview.plan.outstandingAfter)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Cash for this change</span>
                      <span className="tabular-nums">{formatCurrency(preview.plan.cashAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Effective rate</span>
                      <span className="tabular-nums">
                        {preview.plan.eirBefore.toFixed(2)}% → {preview.plan.eirAfter.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Gain / loss</span>
                      <span className="tabular-nums">
                        {preview.plan.gainLoss === 0 ? "—" : formatCurrency(preview.plan.gainLoss)}
                      </span>
                    </div>
                    {preview.plan.testPct !== null ? (
                      <div className="flex items-center justify-between gap-2 sm:col-span-2">
                        <span className="text-muted-foreground">10% test</span>
                        <span className="tabular-nums">
                          {preview.plan.testPct.toFixed(2)}% · {preview.plan.substantial ? "substantial" : "not substantial"}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-2 sm:col-span-2">
                      <span className="text-muted-foreground">Journal entry</span>
                      <span className="tabular-nums">
                        {preview.plan.journalLines.length === 0
                          ? "none — no money moves and no gain or loss"
                          : `${preview.plan.journalLines.length} lines, ${formatCurrency(
                              preview.plan.journalLines.reduce((sum, line) => sum + line.debit, 0),
                            )} debit against ${formatCurrency(preview.plan.journalLines.reduce((sum, line) => sum + line.credit, 0))} credit`}
                      </span>
                    </div>
                  </div>
                  {preview.plan.notices.map((notice) => (
                    <p key={notice} className="mt-2 text-xs text-muted-foreground">
                      {notice}
                    </p>
                  ))}
                </div>
              ) : (
                <Notice tone="warning">{preview.error}</Notice>
              )
            ) : null}
          </div>

          <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              title={canSubmit ? undefined : submitReason}
              className="min-h-11 md:min-h-0"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                  Recording
                </>
              ) : (
                "Record change"
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
