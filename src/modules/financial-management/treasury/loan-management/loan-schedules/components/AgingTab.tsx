"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { DateField } from "./DateField";
import { StatusBadge } from "./StatusBadge";
import { ACCENT, AGING_BUCKETS, LOAN_STATUS_LABEL, LOAN_STATUS_TONE, toneClass } from "../constants";
import type { useSchedules } from "../hooks/useSchedules";
import { runStatusRefresh } from "../providers/schedulesApi";

function money(value: number): string {
  return formatCurrency(value);
}

export function AgingTab({ schedules }: { schedules: ReturnType<typeof useSchedules> }) {
  const { data, filters, isLoading, updateFilters, reload } = schedules;
  const [isRefreshing, setRefreshing] = useState(false);

  const aging = data.aging;
  const split = data.currentPortion;
  const hasLoans = data.loans.length > 0;
  const scopeLabel = data.loan ? data.loan.loanNo : "the whole portfolio";

  async function refreshStatuses() {
    setRefreshing(true);
    try {
      const result = await runStatusRefresh({ asOf: filters.asOf, loanId: filters.loanId, dryRun: false });
      const changes = result.markedDue + result.markedOverdue;
      if (changes === 0) {
        toast.success(`No installment changed. ${result.scanned} read as of ${result.asOf}.`);
      } else {
        toast.success(
          `Updated ${result.updated} installment${result.updated === 1 ? "" : "s"}: ${result.markedDue} now due, ${result.markedOverdue} now overdue.`,
        );
      }
      reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The statuses could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={`overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Principal by days past the payment date</h2>
            <p className="text-xs text-muted-foreground">
              Unpaid principal only, counted from each installment&apos;s payment date to the as-of date.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {data.agingRows.length} loan{data.agingRows.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-b border-border/50 px-4 py-3">
          <div className="min-w-[180px]">
            <DateField
              id="aging-as-of"
              value={filters.asOf}
              onChange={(value) => updateFilters({ asOf: value })}
              placeholder="As of date"
              aria-label="As of date"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 md:min-h-0"
            onClick={() => void refreshStatuses()}
            disabled={isRefreshing || isLoading || !hasLoans}
            title={
              !hasLoans
                ? "Nothing to scan yet: no borrowing is registered."
                : isLoading
                  ? "Waiting for the schedule to finish reading."
                  : undefined
            }
          >
            {isRefreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            )}
            Refresh statuses
          </Button>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Moves upcoming installments to due on their payment date and to overdue after the loan&apos;s grace days.
            Installments with money on them are left alone.
          </p>
        </div>

        {!hasLoans ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium">No loan has been registered yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Aging needs installments. Record a borrowing on the Loan Register and release it to generate a schedule.
            </p>
          </div>
        ) : isLoading && data.agingRows.length === 0 ? (
          <div className="grid grid-cols-2 gap-2 p-4 min-[1100px]:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 px-4 py-3 min-[900px]:grid-cols-3 min-[1300px]:grid-cols-6">
              {AGING_BUCKETS.map((bucket) => {
                const amount = aging[bucket.key];
                const late = bucket.key !== "current" && amount > 0;
                return (
                  <div
                    key={bucket.key}
                    className={`min-w-0 rounded-xl border border-border/50 p-3 ${late ? toneClass("danger") : ""}`}
                    title={bucket.hint}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {bucket.label}
                    </p>
                    <p className="mt-1 truncate text-base font-semibold tabular-nums">{money(amount)}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-y border-border/50 px-4 py-2 text-xs text-muted-foreground">
              <span>
                Overdue principal <span className="font-semibold tabular-nums text-foreground">{money(aging.overduePrincipal)}</span>
              </span>
              <span>
                Outstanding <span className="font-semibold tabular-nums text-foreground">{money(aging.outstandingPrincipal)}</span>
              </span>
              <span>As of {data.asOf}</span>
            </div>

            <div className="hidden overflow-x-auto min-[1300px]:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Loan</TableHead>
                    <TableHead className="w-[140px]">Status</TableHead>
                    {AGING_BUCKETS.map((bucket) => (
                      <TableHead key={bucket.key} className="w-[120px] text-right" title={bucket.hint}>
                        {bucket.label}
                      </TableHead>
                    ))}
                    <TableHead className="w-[140px] text-right">Overdue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.agingRows.map((row) => (
                    <TableRow key={row.loanId}>
                      <TableCell className="max-w-[200px]">
                        <p className="truncate font-mono text-xs" title={row.loanNo}>
                          {row.loanNo}
                        </p>
                        <p className="truncate text-xs text-muted-foreground" title={row.lenderName}>
                          {row.lenderName}
                        </p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={LOAN_STATUS_TONE[row.status]}>{LOAN_STATUS_LABEL[row.status]}</StatusBadge>
                      </TableCell>
                      {AGING_BUCKETS.map((bucket) => (
                        <TableCell key={bucket.key} className="text-right tabular-nums">
                          {row.buckets[bucket.key] > 0 ? money(row.buckets[bucket.key]) : "—"}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums">
                        {row.buckets.overduePrincipal > 0 ? money(row.buckets.overduePrincipal) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="text-xs text-muted-foreground">
                      {data.agingRows.length} loan{data.agingRows.length === 1 ? "" : "s"}
                    </TableCell>
                    {AGING_BUCKETS.map((bucket) => (
                      <TableCell key={bucket.key} className="text-right tabular-nums">
                        {money(aging[bucket.key])}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{money(aging.overduePrincipal)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <ul className="divide-y divide-border min-[1300px]:hidden">
              {data.agingRows.map((row) => {
                const late = AGING_BUCKETS.filter((bucket) => bucket.key !== "current" && row.buckets[bucket.key] > 0);
                return (
                  <li key={row.loanId} className="space-y-1 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">{row.loanNo}</span>
                      <StatusBadge tone={LOAN_STATUS_TONE[row.status]}>{LOAN_STATUS_LABEL[row.status]}</StatusBadge>
                    </div>
                    <p className="truncate text-sm font-medium" title={row.lenderName}>
                      {row.lenderName}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Current {money(row.buckets.current)} · overdue {money(row.buckets.overduePrincipal)}
                    </p>
                    {late.length > 0 ? (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {late.map((bucket) => `${bucket.label}: ${money(row.buckets[bucket.key])}`).join(" · ")}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Current and non-current principal</h2>
            <p className="text-xs text-muted-foreground">
              The PAS 1 split for {scopeLabel}: what is payable inside twelve months of {data.asOf}, and the rest.
            </p>
          </div>
        </div>

        {split === null ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium">There is no principal to split yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing is outstanding on {scopeLabel} as of {data.asOf}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current</p>
              <p className="mt-1 truncate text-lg font-semibold tabular-nums">{money(split.current)}</p>
              <p className="text-xs text-muted-foreground">
                Due inside 12 months of {split.asOf}, plus everything already past its payment date.
              </p>
            </div>
            <div className="rounded-xl border border-border/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Non-current</p>
              <p className="mt-1 truncate text-lg font-semibold tabular-nums">{money(split.nonCurrent)}</p>
              <p className="text-xs text-muted-foreground">Due after {split.asOf} plus twelve months.</p>
            </div>
            <div className="rounded-xl border border-border/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Outstanding principal
              </p>
              <p className="mt-1 truncate text-lg font-semibold tabular-nums">{money(split.outstandingPrincipal)}</p>
              <p className="text-xs text-muted-foreground">
                {split.ties
                  ? "Ties to the principal on the loan records."
                  : `Installments total ${money(split.schedulePrincipal)} against ${money(split.loanPrincipal)} on the loan records.`}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
