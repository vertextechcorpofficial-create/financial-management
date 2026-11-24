"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { formatDateMDY } from "../pht";

import {
  BUSINESS_DAY_RULES,
  BUSINESS_DAY_RULE_LABEL,
  DST_TREATMENTS,
  DST_TREATMENT_LABEL,
  FIRST_PERIOD_BASES,
  FIRST_PERIOD_BASIS_LABEL,
  LENDER_TYPES,
  LENDER_TYPE_LABEL,
  PAS23_TYPE_LABEL,
  PAYMENT_FREQUENCIES,
  PAYMENT_FREQUENCY_LABEL,
  RATE_TYPES,
  RATE_TYPE_LABEL,
  REPAYMENT_METHODS,
  REPAYMENT_METHOD_HINT,
  REPAYMENT_METHOD_LABEL,
  REPAYMENT_METHOD_OPTION_LABEL,
  SECURITIES,
  SECURITY_LABEL,
} from "../constants";
import { createLoan, fetchOptions, LoanFieldError } from "../providers/registerApi";
import { documentaryStampTax, daysBetween, previewLoan } from "../services/loanEngine";
import type { LoanPaymentAccountRow } from "../types";
import { DateField } from "./DateField";
import { OptionCombobox } from "./OptionCombobox";

const today = new Date().toISOString().slice(0, 10);

function initial() {
  return {
    lenderName: "",
    lenderType: "BANK",
    branch: "",
    accountOfficer: "",
    contactPhone: "",
    contactEmail: "",
    accountNo: "",
    purpose: "",
    security: "NONE",
    securityValue: "",
    guarantor: "",
    principal: "",
    annualRate: "",
    rateType: "FIXED",
    repaymentMethod: "ORDINARY_ANNUITY",
    paymentFrequency: "MONTHLY",
    termPayments: "",
    releaseDate: today,
    firstPaymentDate: "",
    firstPeriodBasis: "REGULAR",
    businessDayRule: "FOLLOWING",
    proceedsAccountId: "",
    processingFee: "0",
    dstTreatment: "DEDUCTED",
    otherCosts: "0",
    penaltyRateMonthly: "0",
    graceDays: "0",
    pas23Applies: false,
    pas23BorrowingType: "SPECIFIC",
    pas23Asset: "",
    pas23CapitalizeFrom: "",
    pas23CapitalizeUntil: "",
    remarks: "",
  };
}

type Values = ReturnType<typeof initial>;

const amount = (raw: string) => Number(raw.replace(/,/g, "")) || 0;

export function NewLoanDialog({
  open,
  onOpenChange,
  accounts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: LoanPaymentAccountRow[];
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [banks, setBanks] = useState<Array<{ id: number; name: string }>>([]);
  const [banksFailed, setBanksFailed] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    let alive = true;
    fetchOptions()
      .then((options) => {
        if (alive) setBanks(options.banks);
      })
      .catch(() => {
        if (alive) setBanksFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  /** What the borrower will actually sign: the desk should not have to save a loan to learn the
   *  installment, so the same engine that writes the schedule also answers here. */
  const preview = useMemo(() => {
    const principal = amount(values.principal);
    const rate = amount(values.annualRate);
    const term = Math.trunc(amount(values.termPayments));
    if (!(principal > 0) || term < 1) return null;
    if (!values.releaseDate || !values.firstPaymentDate) return null;
    if (values.firstPaymentDate < values.releaseDate) return null;

    const shared = {
      principal,
      annualRate: rate,
      termPayments: term,
      repaymentMethod: values.repaymentMethod as never,
      paymentFrequency: values.paymentFrequency as never,
      releaseDate: values.releaseDate,
      firstPaymentDate: values.firstPaymentDate,
      firstPeriodBasis: values.firstPeriodBasis as never,
      businessDayRule: values.businessDayRule as never,
      holidays: [] as string[],
    };
    try {
      const first = previewLoan({ ...shared, processingFee: 0, dstAmount: 0, dstTreatment: "NOT_APPLICABLE" as never, otherCosts: 0 });
      const termDays = Math.max(0, daysBetween(values.releaseDate, first.maturityDate));
      const dstAmount =
        values.dstTreatment === "NOT_APPLICABLE"
          ? 0
          : documentaryStampTax(principal, termDays, values.security as never);
      return previewLoan({
        ...shared,
        processingFee: amount(values.processingFee),
        dstAmount,
        dstTreatment: values.dstTreatment as never,
        otherCosts: amount(values.otherCosts),
      });
    } catch {
      return null;
    }
  }, [values]);

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!values.lenderName.trim()) next.lenderName = "Enter the lender.";
    if (!values.accountNo.trim()) next.accountNo = "Enter the loan account or PN number.";
    if (!values.purpose.trim()) next.purpose = "Enter what the loan is for.";
    if (!(amount(values.principal) > 0)) next.principal = "Enter the principal amount.";
    if (!(amount(values.annualRate) >= 0)) next.annualRate = "Enter the nominal rate.";
    if (!(amount(values.termPayments) >= 1)) next.termPayments = "Enter how many payments are due.";
    if (!values.releaseDate) next.releaseDate = "Choose the release date.";
    if (!values.firstPaymentDate) next.firstPaymentDate = "Choose the first payment date.";
    if (!values.proceedsAccountId) next.proceedsAccountId = "Choose the account the money landed in.";
    if (values.firstPaymentDate && values.firstPaymentDate < values.releaseDate) {
      next.firstPaymentDate = "The first payment cannot fall before the release date.";
    }
    if (values.pas23Applies && !values.pas23BorrowingType) {
      next.pas23BorrowingType = "Choose the borrowing type PAS 23 splits by.";
    }
    return next;
  }

  async function submit() {
    const found = validate();
    setErrors(found);
    const blockers = Object.keys(found);
    if (blockers.length > 0) {
      // QA1: "Some fields need attention" on a 3-step form told nobody which field or which step.
      const first = blockers[0];
      const stepOf = [1, 2, 3].find((index) => STEP_FIELDS[index].includes(first));
      if (stepOf) setStep(stepOf);
      toast.error(found[first]);
      focusFirstError();
      return;
    }

    setIsSaving(true);
    try {
      const created = await createLoan({
        lenderName: values.lenderName.trim(),
        lenderType: values.lenderType,
        branch: values.branch.trim(),
        accountOfficer: values.accountOfficer.trim(),
        contactPhone: values.contactPhone.trim(),
        contactEmail: values.contactEmail.trim(),
        accountNo: values.accountNo.trim(),
        purpose: values.purpose.trim(),
        security: values.security,
        securityValue: values.securityValue ? amount(values.securityValue) : null,
        guarantor: values.guarantor.trim(),
        principal: amount(values.principal),
        annualRate: amount(values.annualRate),
        rateType: values.rateType,
        repaymentMethod: values.repaymentMethod,
        paymentFrequency: values.paymentFrequency,
        termPayments: Math.trunc(amount(values.termPayments)),
        releaseDate: values.releaseDate,
        firstPaymentDate: values.firstPaymentDate,
        firstPeriodBasis: values.firstPeriodBasis,
        businessDayRule: values.businessDayRule,
        proceedsAccountId: Number(values.proceedsAccountId),
        processingFee: amount(values.processingFee),
        dstTreatment: values.dstTreatment,
        otherCosts: amount(values.otherCosts),
        penaltyRateMonthly: amount(values.penaltyRateMonthly),
        graceDays: Math.trunc(amount(values.graceDays)),
        pas23Applies: values.pas23Applies,
        pas23BorrowingType: values.pas23Applies ? values.pas23BorrowingType : null,
        pas23Asset: values.pas23Asset.trim(),
        pas23CapitalizeFrom: values.pas23CapitalizeFrom,
        pas23CapitalizeUntil: values.pas23CapitalizeUntil,
        remarks: values.remarks.trim(),
      });
      toast.success(`${created.loanNo} recorded. It is waiting for approval.`);
      setValues(initial());
      onSaved();
      onOpenChange(false);
    } catch (cause) {
      // The server owns the rules the form does not repeat (a future release date among them), so
      // its field errors are painted exactly like the local ones: message under the field, the
      // step that holds the first one, and focus on it.
      if (cause instanceof LoanFieldError) {
        const mapped: Record<string, string> = {};
        for (const [field, messages] of Object.entries(cause.fieldErrors)) {
          if (messages.length > 0) mapped[field] = messages[0];
        }
        setErrors(mapped);
        const first = Object.keys(mapped)[0];
        const stepOf = [1, 2, 3].find((index) => STEP_FIELDS[index].includes(first));
        if (stepOf) setStep(stepOf);
        if (first) toast.error(mapped[first]);
        focusFirstError();
        return;
      }
      toast.error(cause instanceof Error ? cause.message : "The loan could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  const accountOptions = accounts.map((account) => ({
    value: String(account.id),
    label: account.name,
    description: account.is_active ? undefined : "inactive",
  }));

  const proceedsAccount = accounts.find((account) => String(account.id) === values.proceedsAccountId);

  const aBank = values.lenderType === "BANK";

  /** Every step keeps the engine's own validation: Next refuses to move on while a field it
   *  shows is wrong, and Record loan still validates the whole form. */
  const STEP_FIELDS: Record<number, string[]> = {
    1: ["lenderName", "accountNo", "purpose"],
    2: ["principal", "annualRate", "termPayments", "releaseDate", "firstPaymentDate", "proceedsAccountId", "pas23BorrowingType"],
    3: [],
  };
  const STEP_TITLE: Record<number, string> = { 1: "Lender details", 2: "Terms and charges", 3: "Summary" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[85vw] lg:max-w-[1000px]"
      >
        <DialogHeader className="space-y-1 border-b px-6 py-4">
          <DialogTitle>New loan</DialogTitle>
          <div className="flex items-center gap-2 pt-1">
            {[1, 2, 3].map((index) => (
              <span
                key={index}
                className={
                  index === step
                    ? "h-1.5 flex-1 rounded-full bg-primary"
                    : index < step
                      ? "h-1.5 flex-1 rounded-full bg-primary/40"
                      : "h-1.5 flex-1 rounded-full bg-muted"
                }
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Step {step} of 3 · {STEP_TITLE[step]}. The schedule, effective rate and stamp tax are computed from these
            terms; nothing posts until the loan is released.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {step >= 2 ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Tile label="Installment" value={preview ? formatCurrency(preview.installmentAmount) : "not computed"} />
              <Tile label="Net proceeds" value={preview ? formatCurrency(preview.netProceeds) : "not computed"} />
              <Tile
                label="Effective rate a year"
                value={preview ? `${formatNumber(preview.effectiveAnnualRate * 100, "en-PH", 3)}%` : "not computed"}
              />
              <Tile label="Maturity" value={preview ? formatDateMDY(preview.maturityDate) : "not computed"} />
            </div>
          ) : null}

          <div className="space-y-4">
            {step === 1 ? (<>
            <Group title="Lender" hint={aBank ? "Chosen from the banks the business has on file." : undefined}>
              {aBank ? (
                <Field label="Lender" error={errors.lenderName} required>
                  <OptionCombobox
                    value={values.lenderName}
                    onChange={(value) => set("lenderName", value)}
                    options={banks.map((bank) => ({ value: bank.name, label: bank.name }))}
                    placeholder={banksFailed ? "The bank list could not be read" : "Choose the bank"}
                    searchPlaceholder="Search banks"
                    emptyLabel={banksFailed ? "The bank list could not be read" : "No bank matches."}
                    allowCustom
                  />
                </Field>
              ) : (
                <Field label="Lender" error={errors.lenderName} required>
                  <Input
                    value={values.lenderName}
                    onChange={(event) => set("lenderName", event.target.value)}
                    placeholder="Name the lender"
                  />
                </Field>
              )}
              <Field label="Lender type">
                <Select
              value={values.lenderType}
              onValueChange={(value) => {
                // A bank name is not a person's name: switching the kind must not carry the old lender over.
                set("lenderType", value);
                set("lenderName", "");
              }}
            >
                  <SelectTrigger className="w-full min-w-0 [&>span]:min-w-0 [&>span]:truncate">
                    {/* The list spells out the timing; the closed control keeps the short name so a
                        two-line option cannot inflate a 36px trigger. */}
                    <SelectValue className="truncate">{LENDER_TYPE_LABEL[values.lenderType as never]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                    {LENDER_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {LENDER_TYPE_LABEL[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Loan account / PN number" error={errors.accountNo} required>
                <Input value={values.accountNo} onChange={(event) => set("accountNo", event.target.value)} />
              </Field>
              <Field label="Purpose" error={errors.purpose} required>
                <Input value={values.purpose} onChange={(event) => set("purpose", event.target.value)} />
              </Field>
              <Field label="Branch">
                <Input value={values.branch} onChange={(event) => set("branch", event.target.value)} />
              </Field>
              <Field label="Account officer">
                <Input
                  value={values.accountOfficer}
                  onChange={(event) => set("accountOfficer", event.target.value)}
                />
              </Field>
              <Field label="Contact phone">
                <Input value={values.contactPhone} onChange={(event) => set("contactPhone", event.target.value)} />
              </Field>
              <Field label="Contact email">
                <Input value={values.contactEmail} onChange={(event) => set("contactEmail", event.target.value)} />
              </Field>
            </Group>
            </>) : null}

            {step === 2 ? (<>
            <Group title="Terms">
              <Field label="Principal" error={errors.principal} required>
                <Input
                  inputMode="decimal"
                  value={values.principal}
                  onChange={(event) => set("principal", event.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Nominal rate a year (%)" error={errors.annualRate} required>
                <Input
                  inputMode="decimal"
                  value={values.annualRate}
                  onChange={(event) => set("annualRate", event.target.value)}
                  placeholder="0.0000"
                />
              </Field>
              <Field label="Rate type">
                <Select value={values.rateType} onValueChange={(value) => set("rateType", value)}>
                  <SelectTrigger className="w-full min-w-0 [&>span]:min-w-0 [&>span]:truncate">
                    {/* The list spells out the timing; the closed control keeps the short name so a
                        two-line option cannot inflate a 36px trigger. */}
                    <SelectValue className="truncate">{RATE_TYPE_LABEL[values.rateType as never]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                    {RATE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {RATE_TYPE_LABEL[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Repayment method">
                {/* The label opens with the timing, so the closed trigger carries it too; the hint
                    after it is clipped by `truncate` rather than shown in full. */}
                <Select
                  value={values.repaymentMethod}
                  onValueChange={(value) => set("repaymentMethod", value)}
                >
                  <SelectTrigger className="w-full min-w-0 [&>span]:min-w-0 [&>span]:truncate">
                    {/* The list spells out the timing; the closed control keeps the short name so a
                        two-line option cannot inflate a 36px trigger. */}
                    <SelectValue className="truncate">{REPAYMENT_METHOD_LABEL[values.repaymentMethod as never]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-80 min-w-[200px] [&_[data-slot=select-item]]:whitespace-normal">
                    {REPAYMENT_METHODS.map((method) => (
                      /* QA item 4: the timing belongs in the label, not only in the subtext. */
                      <SelectItem key={method} value={method} className="items-start py-2">
                        <span className="block">
                          <span className="block">{REPAYMENT_METHOD_OPTION_LABEL[method]}</span>
                          <span className="mt-0.5 block max-w-[300px] text-xs font-normal text-muted-foreground">
                            {REPAYMENT_METHOD_HINT[method]}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Payment frequency">
                <Select value={values.paymentFrequency} onValueChange={(value) => set("paymentFrequency", value)}>
                  <SelectTrigger className="w-full min-w-0 [&>span]:min-w-0 [&>span]:truncate">
                    {/* The list spells out the timing; the closed control keeps the short name so a
                        two-line option cannot inflate a 36px trigger. */}
                    <SelectValue className="truncate">{PAYMENT_FREQUENCY_LABEL[values.paymentFrequency as never]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                    {PAYMENT_FREQUENCIES.map((frequency) => (
                      <SelectItem key={frequency} value={frequency}>
                        {PAYMENT_FREQUENCY_LABEL[frequency]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Number of payments" error={errors.termPayments} required>
                <Input
                  inputMode="numeric"
                  value={values.termPayments}
                  onChange={(event) => set("termPayments", event.target.value)}
                />
              </Field>
              <Field label="Release date" required>
                <DateField
                  value={values.releaseDate}
                  onChange={(value) => set("releaseDate", value)}
                  inDialog
                  maxDate={today}
                />
              </Field>
              <Field label="First payment date" error={errors.firstPaymentDate} required>
                <DateField
                  value={values.firstPaymentDate}
                  onChange={(value) => set("firstPaymentDate", value)}
                  inDialog
                  minDate={values.releaseDate}
                />
              </Field>
              <Field label="First period interest">
                <Select value={values.firstPeriodBasis} onValueChange={(value) => set("firstPeriodBasis", value)}>
                  <SelectTrigger className="w-full min-w-0 [&>span]:min-w-0 [&>span]:truncate">
                    {/* The list spells out the timing; the closed control keeps the short name so a
                        two-line option cannot inflate a 36px trigger. */}
                    <SelectValue className="truncate">{FIRST_PERIOD_BASIS_LABEL[values.firstPeriodBasis as never]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                    {FIRST_PERIOD_BASES.map((basis) => (
                      <SelectItem key={basis} value={basis}>
                        {FIRST_PERIOD_BASIS_LABEL[basis]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Due date on a holiday">
                <Select value={values.businessDayRule} onValueChange={(value) => set("businessDayRule", value)}>
                  <SelectTrigger
                    className="[&>span]:min-w-0 [&>span]:truncate"
                    title={BUSINESS_DAY_RULE_LABEL[values.businessDayRule as never]}
                  >
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                    {BUSINESS_DAY_RULES.map((rule) => (
                      <SelectItem key={rule} value={rule}>
                        {BUSINESS_DAY_RULE_LABEL[rule]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Security given">
                <Select value={values.security} onValueChange={(value) => set("security", value)}>
                  <SelectTrigger className="w-full min-w-0 [&>span]:min-w-0 [&>span]:truncate">
                    {/* The list spells out the timing; the closed control keeps the short name so a
                        two-line option cannot inflate a 36px trigger. */}
                    <SelectValue className="truncate">{SECURITY_LABEL[values.security as never]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                    {SECURITIES.map((security) => (
                      <SelectItem key={security} value={security}>
                        {SECURITY_LABEL[security]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Security value">
                <Input
                  inputMode="decimal"
                  value={values.securityValue}
                  onChange={(event) => set("securityValue", event.target.value)}
                  disabled={values.security === "NONE"}
                  placeholder={values.security === "NONE" ? "No security given" : "0.00"}
                />
              </Field>
            </Group>

            <Group title="Money in" hint="What the lender releases, and what it keeps.">
              <Field label="Proceeds account" error={errors.proceedsAccountId} required>
                <OptionCombobox
                  value={values.proceedsAccountId}
                  onChange={(value) => set("proceedsAccountId", value)}
                  options={accountOptions}
                  placeholder="Choose the account the money landed in"
                  searchPlaceholder="Search accounts"
                  emptyLabel="No payment account is set up yet"
                />
              </Field>
              <Field label="Processing fee">
                <Input
                  inputMode="decimal"
                  value={values.processingFee}
                  onChange={(event) => set("processingFee", event.target.value)}
                />
              </Field>
              <Field label="Documentary stamp tax">
                <Select value={values.dstTreatment} onValueChange={(value) => set("dstTreatment", value)}>
                  <SelectTrigger className="w-full min-w-0 [&>span]:min-w-0 [&>span]:truncate">
                    {/* The list spells out the timing; the closed control keeps the short name so a
                        two-line option cannot inflate a 36px trigger. */}
                    <SelectValue className="truncate">{DST_TREATMENT_LABEL[values.dstTreatment as never]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                    {DST_TREATMENTS.map((treatment) => (
                      <SelectItem key={treatment} value={treatment}>
                        {DST_TREATMENT_LABEL[treatment]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Stamp tax computed"
                hint={preview ? `${formatCurrency(preview.dstAmount)} on this principal and term` : "Filled in from the terms"}
              >
                {/* A disabled input still draws a text caret; this value is derived, so it is printed. */}
                <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm tabular-nums">
                  {preview ? formatCurrency(preview.dstAmount) : "not computed"}
                </div>
              </Field>
              <Field label="Other costs paid up front">
                <Input
                  inputMode="decimal"
                  value={values.otherCosts}
                  onChange={(event) => set("otherCosts", event.target.value)}
                />
              </Field>
              <Field label="Penalty a month (%)">
                <Input
                  inputMode="decimal"
                  value={values.penaltyRateMonthly}
                  onChange={(event) => set("penaltyRateMonthly", event.target.value)}
                />
              </Field>
              <Field label="Grace days">
                <Input
                  inputMode="numeric"
                  value={values.graceDays}
                  onChange={(event) => set("graceDays", event.target.value)}
                />
              </Field>
              <Field label="Guarantor">
                <Input value={values.guarantor} onChange={(event) => set("guarantor", event.target.value)} />
              </Field>
            </Group>

            <Group title="PAS 23 and notes">
              <label className="col-span-full flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={values.pas23Applies}
                  onChange={(event) => set("pas23Applies", event.target.checked)}
                />
                <span>
                  Interest is split by day because the borrowing is general or funds a qualifying asset
                </span>
              </label>
              {values.pas23Applies ? (
                <>
                  <Field label="Borrowing type" error={errors.pas23BorrowingType}>
                    <Select
                      value={values.pas23BorrowingType}
                      onValueChange={(value) => set("pas23BorrowingType", value)}
                    >
                      <SelectTrigger>
                        <SelectValue className="truncate" />
                      </SelectTrigger>
                      <SelectContent className="min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                        <SelectItem value="SPECIFIC">Specific borrowing</SelectItem>
                        <SelectItem value="GENERAL">General borrowing</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Qualifying asset">
                    <Input value={values.pas23Asset} onChange={(event) => set("pas23Asset", event.target.value)} />
                  </Field>
                  <Field label="Capitalize from">
                    <DateField
                      value={values.pas23CapitalizeFrom}
                      onChange={(value) => set("pas23CapitalizeFrom", value)}
                      inDialog
                      placeholder="Choose a date"
                    />
                  </Field>
                  <Field label="Capitalize until">
                    <DateField
                      value={values.pas23CapitalizeUntil}
                      onChange={(value) => set("pas23CapitalizeUntil", value)}
                      inDialog
                      placeholder="Choose a date"
                    />
                  </Field>
                </>
              ) : null}
              <div className="col-span-full">
                <Field label="Remarks">
                  <Textarea
                    rows={2}
                    value={values.remarks}
                    onChange={(event) => set("remarks", event.target.value)}
                  />
                </Field>
              </div>
            </Group>
            </>) : null}

            {step === 3 ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-2">
                  <p className="text-xs text-muted-foreground">
                    Nothing is saved yet. Every figure below comes from the first two steps.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs"
                    onClick={() => setStep(1)}
                  >
                    Edit earlier steps
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <SummaryGroup title="Lender details">
                    <SummaryRow label="Lender" value={values.lenderName || "not recorded"} />
                    <SummaryRow label="Lender type" value={LENDER_TYPE_LABEL[values.lenderType as never]} />
                    <SummaryRow label="Loan account / PN number" value={values.accountNo || "not recorded"} />
                    <SummaryRow label="Purpose" value={values.purpose || "not recorded"} />
                    <SummaryRow label="Branch" value={values.branch || "not recorded"} />
                    <SummaryRow label="Account officer" value={values.accountOfficer || "not recorded"} />
                    <SummaryRow label="Contact phone" value={values.contactPhone || "not recorded"} />
                    <SummaryRow label="Contact email" value={values.contactEmail || "not recorded"} />
                  </SummaryGroup>

                  <SummaryGroup title="Terms">
                    <SummaryRow label="Principal" value={formatCurrency(amount(values.principal))} strong />
                    <SummaryRow
                      label="Nominal rate a year"
                      value={values.annualRate.trim() === "" ? "not entered" : `${formatNumber(amount(values.annualRate), "en-PH", 4)}% · ${RATE_TYPE_LABEL[values.rateType as never]}`}
                    />
                    <SummaryRow label="Repayment method" value={REPAYMENT_METHOD_LABEL[values.repaymentMethod as never]} />
                    <SummaryRow label="Payment frequency" value={PAYMENT_FREQUENCY_LABEL[values.paymentFrequency as never]} />
                    <SummaryRow label="Number of payments" value={values.termPayments || "not recorded"} />
                    <SummaryRow label="Release date" value={values.releaseDate ? formatDateMDY(values.releaseDate) : "not recorded"} />
                    <SummaryRow label="First payment date" value={values.firstPaymentDate ? formatDateMDY(values.firstPaymentDate) : "not recorded"} />
                    <SummaryRow
                      label="First period interest"
                      value={FIRST_PERIOD_BASIS_LABEL[values.firstPeriodBasis as never]}
                    />
                    <SummaryRow
                      label="Due date on a holiday"
                      value={BUSINESS_DAY_RULE_LABEL[values.businessDayRule as never]}
                    />
                    <SummaryRow
                      label="Security"
                      value={
                        values.security === "NONE"
                          ? SECURITY_LABEL.NONE
                          : `${SECURITY_LABEL[values.security as never]}${
                              values.securityValue ? ` · ${formatCurrency(amount(values.securityValue))}` : ""
                            }`
                      }
                    />
                    <SummaryRow
                      label="PAS 23"
                      value={
                        values.pas23Applies
                          ? [
                              PAS23_TYPE_LABEL[values.pas23BorrowingType],
                              values.pas23Asset || "asset not named",
                              values.pas23CapitalizeFrom ? `from ${values.pas23CapitalizeFrom}` : null,
                              values.pas23CapitalizeUntil ? `to ${values.pas23CapitalizeUntil}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : "Not applied"
                      }
                    />
                  </SummaryGroup>

                  <SummaryGroup title="Charges and computed figures">
                    <SummaryRow label="Proceeds account" value={proceedsAccount?.name ?? "not recorded"} />
                    <SummaryRow label="Processing fee" value={formatCurrency(amount(values.processingFee))} />
                    <SummaryRow
                      label="Documentary stamp tax"
                      value={DST_TREATMENT_LABEL[values.dstTreatment as never]}
                    />
                    <SummaryRow label="Stamp tax computed" value={preview ? formatCurrency(preview.dstAmount) : "not computed"} />
                    <SummaryRow label="Other costs paid up front" value={formatCurrency(amount(values.otherCosts))} />
                    <SummaryRow
                      label="Penalty"
                      value={`${formatNumber(amount(values.penaltyRateMonthly), "en-PH", 2)}% a month · ${formatNumber(amount(values.graceDays))} grace days`}
                    />
                    <SummaryRow label="Guarantor" value={values.guarantor || "not recorded"} />
                    <SummaryRow
                      label="Installment"
                      value={preview ? formatCurrency(preview.installmentAmount) : "not computed"}
                      strong
                    />
                    <SummaryRow label="Net proceeds" value={preview ? formatCurrency(preview.netProceeds) : "not computed"} strong />
                    <SummaryRow
                      label="Effective rate a year"
                      value={preview ? `${formatNumber(preview.effectiveAnnualRate * 100, "en-PH", 4)}%` : "not computed"}
                    />
                    <SummaryRow label="Maturity" value={preview ? formatDateMDY(preview.maturityDate) : "not computed"} />
                  </SummaryGroup>
                </div>

                {values.remarks ? (
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remarks</p>
                    <p className="mt-1 text-sm">{values.remarks}</p>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 border-t bg-muted/20 px-6 py-4">
          <div className="w-full text-xs text-muted-foreground sm:mr-auto sm:w-auto">
            Step {step} of 3 · {STEP_TITLE[step]}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Close
          </Button>
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={isSaving}>
              Back
            </Button>
          ) : null}
          {step < 3 ? (
            <Button
              onClick={() => {
                const found = validate();
                const blocking = Object.keys(found).filter((key) => STEP_FIELDS[step].includes(key));
                if (blocking.length > 0) {
                  setErrors(found);
                  toast.error(found[blocking[0]]);
                  focusFirstError();
                  return;
                }
                setStep(step + 1);
              }}
              disabled={isSaving}
            >
              Next
            </Button>
          ) : (
            <Button onClick={() => void submit()} disabled={isSaving}>
              {isSaving ? "Saving…" : "Record loan"}
            </Button>
          )}
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

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/60">
      <div className="border-b border-border/60 bg-muted/20 px-4 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function SummaryGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/60">
      <h3 className="border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="divide-y divide-border/50">{children}</dl>
    </section>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right tabular-nums", strong && "font-semibold")} title={value}>
        {value}
      </dd>
    </div>
  );
}

/**
 * QA1: the toast named the field but the form never moved, so the reader had to hunt for it.
 * Scrolling to the first inline message and focusing it keeps the sentence and the box together.
 */
function focusFirstError() {
  window.requestAnimationFrame(() => {
    const node = document.querySelector<HTMLElement>('[data-field-error="true"]');
    if (!node) return;
    node.scrollIntoView({ block: "center" });
    // The message is the fallback; the control is what the reader has to fix.
    const field = node.parentElement?.querySelector<HTMLElement>("input, button[role=combobox], textarea, [role=combobox]");
    (field ?? node).focus({ preventScroll: true });
  });
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <div data-field-control aria-invalid={error ? true : undefined} className={error ? "[&_input]:border-destructive [&_button[role=combobox]]:border-destructive" : undefined}>
        {children}
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert" tabIndex={-1} data-field-error="true">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
