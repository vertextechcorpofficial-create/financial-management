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
import { formatCurrency, formatNumber } from "@/lib/utils";

import {
  BUSINESS_DAY_RULES,
  BUSINESS_DAY_RULE_LABEL,
  DST_TREATMENTS,
  DST_TREATMENT_LABEL,
  FIRST_PERIOD_BASES,
  FIRST_PERIOD_BASIS_LABEL,
  LENDER_TYPES,
  LENDER_TYPE_LABEL,
  PAYMENT_FREQUENCIES,
  PAYMENT_FREQUENCY_LABEL,
  RATE_TYPES,
  RATE_TYPE_LABEL,
  REPAYMENT_METHODS,
  REPAYMENT_METHOD_LABEL,
  SECURITIES,
  SECURITY_LABEL,
} from "../constants";
import { createLoan, fetchOptions } from "../providers/registerApi";
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

  useEffect(() => {
    if (!open) return;
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
    if (!values.accountNo.trim()) next.accountNo = "Enter the lender's account number.";
    if (!values.purpose.trim()) next.purpose = "Enter what the loan is for.";
    if (!(amount(values.principal) > 0)) next.principal = "Enter the principal amount.";
    if (!(amount(values.annualRate) >= 0)) next.annualRate = "Enter the nominal rate.";
    if (!(amount(values.termPayments) >= 1)) next.termPayments = "Enter how many payments are due.";
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
    if (Object.keys(found).length > 0) {
      toast.error("Some fields need attention.");
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

  const aBank = values.lenderType === "BANK";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[620px]"
      >
        <DialogHeader className="space-y-1 border-b px-6 py-4">
          <DialogTitle>New loan</DialogTitle>
          <p className="text-xs text-muted-foreground">
            The schedule, the effective rate and the stamp tax are computed from these terms. Nothing posts until the
            loan is released.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Installment" value={preview ? formatCurrency(preview.installmentAmount) : "—"} />
            <Tile label="Net proceeds" value={preview ? formatCurrency(preview.netProceeds) : "—"} />
            <Tile
              label="Effective rate a year"
              value={preview ? `${formatNumber(preview.effectiveAnnualRate * 100, "en-PH", 3)}%` : "—"}
            />
            <Tile label="Maturity" value={preview ? preview.maturityDate : "—"} />
          </div>

          <div className="space-y-4">
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
                <Select value={values.lenderType} onValueChange={(value) => set("lenderType", value)}>
                  <SelectTrigger>
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    {LENDER_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {LENDER_TYPE_LABEL[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Account number" error={errors.accountNo} required>
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
                  <SelectTrigger>
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    {RATE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {RATE_TYPE_LABEL[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Repayment method">
                <Select value={values.repaymentMethod} onValueChange={(value) => set("repaymentMethod", value)}>
                  <SelectTrigger>
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    {REPAYMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {REPAYMENT_METHOD_LABEL[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Payment frequency">
                <Select value={values.paymentFrequency} onValueChange={(value) => set("paymentFrequency", value)}>
                  <SelectTrigger>
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
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
                  <SelectTrigger>
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
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
                  <SelectContent>
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
                  <SelectTrigger>
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
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
                  <SelectTrigger>
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
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
                <Input value={preview ? formatCurrency(preview.dstAmount) : "—"} readOnly disabled />
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
                      <SelectContent>
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
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Close
          </Button>
          <Button onClick={() => void submit()} disabled={isSaving}>
            {isSaving ? "Saving…" : "Record loan"}
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
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
