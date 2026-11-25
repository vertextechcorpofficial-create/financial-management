"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, cn } from "@/lib/utils";

import { formatDateMDY, phtDisplayStamp } from "../pht";
import type { ReconciliationRow, RollForward } from "../types";
import { RESULT_LABEL, RESULT_TONE } from "../constants";
import { DateField } from "./DateField";
import { Notice } from "./Notice";
import { StatusBadge } from "./StatusBadge";

type Props = {
  rollForward: RollForward | null;
  period: { periodStart: string; periodEnd: string };
  onPeriodChange: (next: { periodStart: string; periodEnd: string }) => void;
  onBuild: () => void;
  onSave: (remarks: string) => Promise<ReconciliationRow | null>;
  isBuilding: boolean;
  isSaving: boolean;
  today: string;
};

/** Build → read the nine figures → save. The sentence under the difference is the point of the
 *  screen: it names both balances, so a reader does not have to subtract them. */
export function RollForwardPanel({
  rollForward,
  period,
  onPeriodChange,
  onBuild,
  onSave,
  isBuilding,
  isSaving,
  today,
}: Props) {
  const [remarks, setRemarks] = useState("");
  const [saved, setSaved] = useState<ReconciliationRow | null>(null);

  const periodValid = Boolean(period.periodStart && period.periodEnd) && period.periodStart <= period.periodEnd;
  const readOnly = rollForward?.readOnly ?? false;

  async function handleSave() {
    const row = await onSave(remarks);
    if (row) {
      setSaved(row);
      setRemarks("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0">
            <Label htmlFor="period-start" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Period from
            </Label>
            <DateField
              id="period-start"
              value={period.periodStart}
              onChange={(value) => onPeriodChange({ ...period, periodStart: value })}
              placeholder="Pick the first day"
              aria-label="Period start"
              className="w-full sm:w-[164px]"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="period-end" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Period to
            </Label>
            <DateField
              id="period-end"
              value={period.periodEnd}
              onChange={(value) => onPeriodChange({ ...period, periodEnd: value })}
              placeholder="Pick the last day"
              aria-label="Period end"
              className="w-full sm:w-[164px]"
            />
          </div>
          <Button
            type="button"
            onClick={onBuild}
            disabled={!periodValid || isBuilding}
            className="min-h-11 md:min-h-9"
          >
            {isBuilding ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
            {isBuilding ? "Building" : "Build roll-forward"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Reads every posted loan journal entry and payment in the period, then compares the closing figure with
          the ledger balance on the mapped liability accounts. Nothing is written until you save.
        </p>
        {!periodValid ? (
          <Notice tone="danger" title="Pick the period first" className="mt-2">
            The period needs a start and an end, in that order.
          </Notice>
        ) : null}
        {readOnly ? (
          <Notice tone="warning" title={`Books closed through ${formatDateMDY(rollForward?.lockedThrough)}`} className="mt-2">
            This period is read-only: it can be built and read, but not saved or signed.
          </Notice>
        ) : null}
      </div>

      {rollForward ? (
        <div className="rounded-lg border border-border/60 bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">
                {formatDateMDY(rollForward.periodStart)} to {formatDateMDY(rollForward.periodEnd)}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {rollForward.accounts.map((account) => account.title ?? `Account ${account.coaId}`).join(" · ")}
              </p>
            </div>
            <StatusBadge tone={RESULT_TONE[rollForward.result]}>{RESULT_LABEL[rollForward.result]}</StatusBadge>
          </div>

          <dl className="divide-y divide-border/60">
            {rollForward.lines.map((line) => (
              <div key={line.key} className="flex items-center justify-between gap-4 px-4 py-2">
                <dt title={line.label} className="min-w-0 truncate text-sm">
                  {line.label}
                  <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                    {line.count > 0 ? `${line.count} ${line.count === 1 ? "line" : "lines"}` : "nothing"}
                  </span>
                </dt>
                <dd
                  className={cn(
                    "shrink-0 text-right text-sm tabular-nums",
                    line.key === "closing" && "font-semibold",
                  )}
                >
                  {formatCurrency(line.amount)}
                </dd>
              </div>
            ))}
          </dl>

          <div className="border-t border-border/60 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Difference to the ledger
              </span>
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  Math.abs(rollForward.difference) < 0.005 ? "text-foreground" : "text-destructive",
                )}
              >
                {formatCurrency(rollForward.difference)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{rollForward.sentence}</p>
            {rollForward.notes.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {rollForward.notes.map((note) => (
                  <li key={note} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    <span className="min-w-0">{note}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="border-t border-border/60 px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <Label htmlFor="reconciliation-remarks" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Remarks for this period
                </Label>
                <Textarea
                  id="reconciliation-remarks"
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="What explains this period"
                  rows={3}
                  className="resize-none"
                  disabled={readOnly || isSaving}
                />
              </div>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={readOnly || isSaving}
                title={readOnly ? `The books are closed through ${formatDateMDY(rollForward.lockedThrough)}` : undefined}
                className="min-h-11 md:min-h-9"
              >
                {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
                {isSaving ? "Saving" : "Save roll-forward"}
              </Button>
            </div>
            {saved ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Saved {formatDateMDY(saved.periodStart)} to {formatDateMDY(saved.periodEnd)} on {phtDisplayStamp(saved.createdAt ?? today)}. Sign it
                off from the list below.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
