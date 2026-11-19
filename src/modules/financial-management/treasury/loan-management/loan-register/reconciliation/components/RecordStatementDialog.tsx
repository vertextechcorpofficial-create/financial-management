"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

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
import { formatCurrency } from "@/lib/utils";

import type { LoanOption, StatementVariance } from "../types";
import { DateField } from "./DateField";
import { OptionCombobox } from "./OptionCombobox";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loans: LoanOption[];
  today: string;
  isSaving: boolean;
  onSubmit: (input: {
    loanId: number;
    statementDate: string;
    lenderPrincipal: number;
    lenderInterest: number;
    lenderPenalties: number;
    lenderAdvances: number;
    remarks?: string;
  }) => Promise<{ variances: StatementVariance[] } | null>;
};

const EMPTY_FORM = {
  loanId: "",
  statementDate: "",
  lenderPrincipal: "",
  lenderInterest: "",
  lenderPenalties: "",
  lenderAdvances: "",
  remarks: "",
};

/** Records the lender's four figures. Ours are computed from the schedule, never typed, so the
 *  dialog cannot be used to make the two sides agree. */
export function RecordStatementDialog({ open, onOpenChange, loans, today, isSaving, onSubmit }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const options = loans.map((loan) => ({
    value: String(loan.id),
    label: `${loan.loanNo} · ${loan.lenderName}`,
    searchText: `${loan.loanNo} ${loan.lenderName}`,
    description: formatCurrency(loan.principal),
  }));

  function reset() {
    setForm(EMPTY_FORM);
    setErrors({});
  }

  function parseMoney(value: string): number | null {
    if (value.trim() === "") return null;
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const amounts = {
    principal: parseMoney(form.lenderPrincipal),
    interest: parseMoney(form.lenderInterest),
    penalties: parseMoney(form.lenderPenalties),
    advances: parseMoney(form.lenderAdvances),
  };

  const blockers: Record<string, string> = {};
  if (!form.loanId) blockers.loanId = "Choose the loan this statement is for.";
  if (!form.statementDate) blockers.statementDate = "Pick the statement date.";
  if (amounts.principal === null) blockers.lenderPrincipal = "Enter the lender's principal, even if it is 0.";
  if (amounts.interest === null) blockers.lenderInterest = "Enter the lender's interest, even if it is 0.";
  if (amounts.penalties === null) blockers.lenderPenalties = "Enter the lender's penalties, even if it is 0.";
  if (amounts.advances === null) blockers.lenderAdvances = "Enter the lender's advances, even if it is 0.";
  const blocked = Object.keys(blockers).length > 0;

  async function submit() {
    setErrors({});
    if (blocked) {
      setErrors(blockers);
      return;
    }
    const recorded = await onSubmit({
      loanId: Number(form.loanId),
      statementDate: form.statementDate,
      lenderPrincipal: amounts.principal as number,
      lenderInterest: amounts.interest as number,
      lenderPenalties: amounts.penalties as number,
      lenderAdvances: amounts.advances as number,
      remarks: form.remarks,
    });
    if (recorded) {
      reset();
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[600px]"
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Record a lender statement</DialogTitle>
          <DialogDescription>
            Type the four figures the lender sent. Our principal, interest, penalties and advances are computed from
            the schedule and payments on the statement date.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <div>
            <Label htmlFor="statement-loan" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Loan <span className="text-destructive">*</span>
            </Label>
            <OptionCombobox
              id="statement-loan"
              options={options}
              value={form.loanId}
              onChange={(value) => setForm({ ...form, loanId: value })}
              placeholder="Pick the loan"
              searchPlaceholder="Search loans…"
              emptyLabel="No loan matches that search."
              aria-label="Loan"
              aria-invalid={Boolean(errors.loanId)}
            />
            {errors.loanId ? <p className="mt-1 text-xs text-destructive">{errors.loanId}</p> : null}
          </div>

          <div>
            <Label htmlFor="statement-date" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Statement date <span className="text-destructive">*</span>
            </Label>
            <DateField
              id="statement-date"
              value={form.statementDate}
              onChange={(value) => setForm({ ...form, statementDate: value })}
              placeholder="Pick the statement date"
              maxDate={today}
              inDialog
              aria-label="Statement date"
              aria-invalid={Boolean(errors.statementDate)}
              className="w-full sm:w-[190px]"
            />
            {errors.statementDate ? <p className="mt-1 text-xs text-destructive">{errors.statementDate}</p> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["lenderPrincipal", "Lender principal", "statement-principal"],
                ["lenderInterest", "Lender interest", "statement-interest"],
                ["lenderPenalties", "Lender penalties", "statement-penalties"],
                ["lenderAdvances", "Lender advances", "statement-advances"],
              ] as const
            ).map(([key, label, id]) => (
              <div key={key}>
                <Label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {label} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={id}
                  inputMode="decimal"
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  placeholder="0.00"
                  aria-invalid={Boolean(errors[key])}
                />
                {errors[key] ? <p className="mt-1 text-xs text-destructive">{errors[key]}</p> : null}
              </div>
            ))}
          </div>

          <div>
            <Label htmlFor="statement-remarks" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Remarks
            </Label>
            <Input
              id="statement-remarks"
              value={form.remarks}
              onChange={(event) => setForm({ ...form, remarks: event.target.value })}
              placeholder="Statement reference or why the two sides differ"
            />
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={() => void submit()} disabled={isSaving || blocked}>
            {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
            {isSaving ? "Recording" : "Record statement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
