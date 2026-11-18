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

import { CHANGE_KINDS, CHANGE_KIND_LABEL, PREPAYMENT_OPTION_LABEL, PREPAYMENT_OPTIONS } from "../constants";
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

const money = (value: number) => formatCurrency(Math.abs(value) < 0.005 ? 0 : value);

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

  const plan = preview?.plan ?? null;
  const subtitle = context
    ? `${context.loan.loanNo} · ${context.loan.lenderName} · version ${context.loan.scheduleVersion}`
    : "Choose the loan this change applies to.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[760px]">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4">
          <DialogTitle className="truncate">Record a change</DialogTitle>
          <DialogDescription className="truncate">{subtitle}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Outstanding" value={context ? money(outstandingPrincipal(context.schedule)) : "—"} />
            <Tile label="Installment" value={plan ? money(plan.newInstallment) : context ? money(context.loan.installmentAmount) : "—"} />
            <Tile label="Maturity" value={plan?.newMaturity ?? context?.loan.maturityDate ?? "—"} />
            <Tile label={form.kind === "RATE_CHANGE" ? "Rate after" : "Cash for this"} value={plan ? (form.kind === "RATE_CHANGE" ? `${plan.eirAfter.toFixed(2)}%` : money(plan.cashAmount)) : "—"} />
          </div>

          {isLoadingContext ? (
            <Notice tone="info" title="Reading the loan">
              Schedule and payoff quote for {selectedLoanLabel}.
            </Notice>
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

          {context?.notices.map((notice) => (
            <Notice key={notice} tone={context.canChange ? "info" : "warning"}>
              {notice}
            </Notice>
          ))}

          <Group title="The change">
            <Field label="Loan" required error={errors.loanId} htmlFor="change-loan" span>
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
            </Field>

            <Field label="Kind" htmlFor="change-kind">
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
            </Field>

            <Field label="Effective date" required error={errors.effectiveDate} htmlFor="change-date">
              <DateField
                id="change-date"
                value={form.effectiveDate}
                onChange={(value) => setForm((current) => ({ ...current, effectiveDate: value }))}
                inDialog
              />
            </Field>
          </Group>

          <Group title="Terms">
            {form.kind === "PREPAYMENT" ? (
              <>
                <Field label="Amount prepaid" required error={errors.amount} htmlFor="change-amount">
                  <Input
                    id="change-amount"
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                    aria-invalid={errors.amount ? true : undefined}
                    className="h-9 tabular-nums"
                  />
                </Field>

                <Field label="What the prepayment buys" htmlFor="change-option">
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
                </Field>
              </>
            ) : null}

            {form.kind === "RATE_CHANGE" || form.kind === "RESTRUCTURE" ? (
              <Field label="New rate (%)" required error={errors.newRate} htmlFor="change-rate">
                <Input
                  id="change-rate"
                  inputMode="decimal"
                  value={form.newRate}
                  onChange={(event) => setForm((current) => ({ ...current, newRate: event.target.value }))}
                  aria-invalid={errors.newRate ? true : undefined}
                  className="h-9 tabular-nums"
                />
              </Field>
            ) : null}

            {form.kind === "RESTRUCTURE" ? (
              <Field label="Installments to run" required error={errors.newTermPayments} htmlFor="change-term">
                <Input
                  id="change-term"
                  inputMode="numeric"
                  value={form.newTermPayments}
                  onChange={(event) => setForm((current) => ({ ...current, newTermPayments: event.target.value }))}
                  aria-invalid={errors.newTermPayments ? true : undefined}
                  className="h-9 tabular-nums"
                />
              </Field>
            ) : null}

            <Field label="Prepayment penalty %" htmlFor="change-penalty">
              <Input
                id="change-penalty"
                inputMode="decimal"
                value={form.penaltyRate}
                onChange={(event) => setForm((current) => ({ ...current, penaltyRate: event.target.value }))}
                className="h-9 tabular-nums"
                disabled={form.kind === "RATE_CHANGE"}
              />
            </Field>
          </Group>

          <Group title="Money and notes">
            {needsMoney && context ? (
              <Field label="Money account" required error={errors.accountId} htmlFor="change-account">
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
              </Field>
            ) : null}

            <Field label="Notes" htmlFor="change-notes" span>
              <Textarea
                id="change-notes"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Reference of the borrower's letter"
                rows={2}
                className="min-h-[72px] resize-none"
              />
            </Field>
          </Group>

          {plan ? (
            <section className="overflow-hidden rounded-lg border border-border/60">
              <div className="border-b border-border/60 bg-muted/20 px-4 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Before and after</p>
              </div>
              <dl className="divide-y divide-border/50">
                <Row label="Installment" value={`${money(plan.oldInstallment)} → ${money(plan.newInstallment)}`} />
                <Row label="Maturity" value={`${plan.oldMaturity ?? "—"} → ${plan.newMaturity ?? "—"}`} />
                <Row label="Principal after" value={money(plan.outstandingAfter)} />
                <Row label="Cash for this change" value={money(plan.cashAmount)} />
                <Row label="Effective rate" value={`${plan.eirBefore.toFixed(2)}% → ${plan.eirAfter.toFixed(2)}%`} />
                <Row label="Gain / loss" value={plan.gainLoss === 0 ? "—" : money(plan.gainLoss)} />
                {plan.testPct !== null ? (
                  <Row
                    label="10% test"
                    value={`${plan.testPct.toFixed(2)}% · ${plan.substantial ? "substantial" : "not substantial"}`}
                  />
                ) : null}
                <Row
                  label="Journal entry"
                  value={
                    plan.journalLines.length === 0
                      ? "none · no money moves"
                      : `${plan.journalLines.length} lines · ${money(
                          plan.journalLines.reduce((sum, line) => sum + line.credit, 0),
                        )}`
                  }
                />
              </dl>
              {plan.notices.length > 0 ? (
                <div className="space-y-1 border-t border-border/60 px-4 py-2">
                  {plan.notices.map((notice) => (
                    <p key={notice} className="text-xs text-muted-foreground">
                      {notice}
                    </p>
                  ))}
                </div>
              ) : null}
            </section>
          ) : preview?.error ? (
            <Notice tone="warning">{preview.error}</Notice>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSaving}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={() => void submit()} disabled={!canSubmit} title={canSubmit ? undefined : submitReason}>
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
  span,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor: string;
  span?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={span ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label htmlFor={htmlFor}>
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right tabular-nums">{value}</dd>
    </div>
  );
}
