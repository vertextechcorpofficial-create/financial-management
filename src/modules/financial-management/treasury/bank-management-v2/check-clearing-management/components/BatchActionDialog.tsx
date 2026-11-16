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
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

import { phtDate, toPhtDateString } from "../pht";
import { DateField } from "./DateField";
import type { BankCheck } from "../types";

export type BatchMode = "CLEAR" | "RELEASE" | "DEPOSIT";

type Props = {
  mode: BatchMode;
  checks: BankCheck[];
  open: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (entries: { checkId: number; date: string }[]) => Promise<unknown>;
};

/**
 * Batch clearing, release and deposit (spec section 5): the dates differ per check, so
 * each row carries its own; "Apply to all" is the shortcut for a single statement day.
 * Only CLEAR posts a journal entry — release and deposit were posted at issue and receive.
 */
export function BatchActionDialog({ mode, checks, open, isSaving, onOpenChange, onSubmit }: Props) {
  const today = phtDate();
  const [sameDate, setSameDate] = useState(today);
  const [dates, setDates] = useState<Record<number, string>>({});
  const [touched, setTouched] = useState(false);

  const copy = COPY[mode];
  const noun = checks.length === 1 ? "check" : "checks";

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSameDate(today);
      setDates({});
      setTouched(false);
    }
    onOpenChange(next);
  }

  const dateFor = (check: BankCheck) => dates[check.id] ?? sameDate;
  // Spec 4.3–4.5: every action date is a real date, never in the future; deposit and
  // clearing dates also cannot precede the check date, and clearing cannot precede the
  // date the check was sent.
  const problems = checks
    .map((check) => {
      const value = dateFor(check);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { check, reason: "not a real date" };
      if (value > today) return { check, reason: "in the future" };
      const checkDate = check.checkDate.slice(0, 10);
      if (mode !== "RELEASE" && checkDate && value < checkDate) {
        return { check, reason: `before the check date ${checkDate}` };
      }
      if (mode === "CLEAR") {
        const sentDate = (check.direction === "ISSUED" ? check.releasedAt : check.depositedAt)?.slice(0, 10) ?? "";
        if (sentDate && value < sentDate) return { check, reason: `before the date it was sent (${sentDate})` };
      }
      return null;
    })
    .filter((entry): entry is { check: BankCheck; reason: string } => entry !== null);
  const problemIds = new Set(problems.map((entry) => entry.check.id));

  const total = checks.reduce((sum, check) => sum + check.amount, 0);
  const sharedDate = checks.length > 0 ? dateFor(checks[0]) : "";
  const allSameDate = checks.length > 1 && checks.every((check) => dateFor(check) === sharedDate);
  const batchDisabledTitle = allSameDate
    ? `Every selected check already has this ${copy.dateLabel.toLowerCase()}. Change one row to enable the batch controls.`
    : undefined;

  async function handleSubmit() {
    setTouched(true);
    if (problems.length > 0) return;
    const saved = await onSubmit(checks.map((check) => ({ checkId: check.id, date: dateFor(check) })));
    if (saved) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="w-[95vw] rounded-2xl p-0 sm:max-w-[800px]">
        <div className="flex max-h-[88vh] flex-col overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="line-clamp-1">
              {copy.title}: {checks.length} {noun}
            </DialogTitle>
            <DialogDescription className="line-clamp-2 max-w-2xl">{copy.description}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {checks.length > 1 ? (
              <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,220px)_auto]">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="batch-action-date"
                    className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Same date for all
                  </Label>
                  <DateField
                    id="batch-action-date"
                    inDialog
                    value={sameDate}
                    maxDate={today}
                    disabled={allSameDate}
                    title={batchDisabledTitle}
                    onChange={(value) => {
                      setSameDate(value);
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={allSameDate}
                  title={batchDisabledTitle}
                  onClick={() => setDates(Object.fromEntries(checks.map((check) => [check.id, sameDate])))}
                >
                  Apply to all
                </Button>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-border/50">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Check no.</TableHead>
                    <TableHead className="max-w-[200px]">Payee / customer</TableHead>
                    <TableHead className="w-[120px] text-right">Amount</TableHead>
                    <TableHead className="w-[110px]">Check date</TableHead>
                    <TableHead className="w-[170px]">
                      {copy.dateLabel} <span className="text-destructive">*</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checks.map((check) => {
                    const value = dateFor(check);
                    const isInvalid = problemIds.has(check.id);
                    return (
                      <TableRow key={check.id}>
                        <TableCell className="text-sm">
                          <span className="block truncate" title={check.checkNo}>
                            {check.checkNo}
                          </span>
                          {check.draweeBank ? (
                            <span className="block truncate text-xs text-muted-foreground">{check.draweeBank}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[200px] text-sm">
                          <span className="block truncate" title={check.payee ?? check.payor ?? undefined}>
                            {check.payee ?? check.payor ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{formatCurrency(check.amount)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{toPhtDateString(check.checkDate)}</TableCell>
                        <TableCell>
                          <DateField
                            inDialog
                            aria-label={`${copy.dateLabel} for check ${check.checkNo}`}
                            aria-invalid={isInvalid && touched ? true : undefined}
                            value={value}
                            maxDate={today}
                            onChange={(next) => {
                              setDates((current) => ({ ...current, [check.id]: next }));
                            }}
                            className={isInvalid && touched ? "border-destructive" : undefined}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="text-sm font-medium">
                      Total
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">{formatCurrency(total)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            {touched && problems.length > 0 ? (
              <div className="space-y-1 text-sm text-destructive">
                <p>
                  Nothing was saved. Fix the {copy.dateLabel.toLowerCase()} on{" "}
                  {problems.length === 1 ? "one row" : `${problems.length} rows`}:
                </p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {problems.map(({ check, reason }) => (
                    <li key={check.id}>
                      Check {check.checkNo}: {reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t bg-muted/20 px-6 py-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" disabled={isSaving} onClick={handleSubmit}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {`${copy.verb} (${checks.length})`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const COPY: Record<
  BatchMode,
  { title: string; description: string; dateLabel: string; verb: string }
> = {
  CLEAR: {
    title: "Confirm cleared by bank",
    description:
      "The date the bank shows each check paid (issued) or credited (received). Recording it moves the amount into the bank account.",
    dateLabel: "Clearing date",
    verb: "Clear",
  },
  RELEASE: {
    title: "Confirm release",
    description: "The date each check was handed to the payee. Releasing moves the check into clearing.",
    dateLabel: "Release date",
    verb: "Release",
  },
  DEPOSIT: {
    title: "Confirm deposit",
    description: "The date each check was deposited. Depositing moves the check into clearing.",
    dateLabel: "Deposit date",
    verb: "Deposit",
  },
};
