"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

import { phtDisplayStamp } from "../pht";
import type { ReconciliationRow } from "../types";
import { RESULT_LABEL, RESULT_TONE } from "../constants";
import { StatusBadge } from "./StatusBadge";

const COLUMNS = 13;

type Props = {
  rows: ReconciliationRow[];
  isLoading: boolean;
  isFiltered: boolean;
  onSignOff: (row: ReconciliationRow) => void;
};

/** A peso amount, with a rounding zero shown as zero rather than as a minus zero. */
function peso(value: number) {
  return formatCurrency(Math.abs(value) < 0.005 ? 0 : value);
}

function money(value: number) {
  return <span className="tabular-nums">{peso(value)}</span>;
}

function signedLabel(row: ReconciliationRow) {
  if (!row.signedAt) return <span className="text-muted-foreground">Not signed</span>;
  return (
    <span className="text-xs">
      <span className="block truncate" title={row.signedByName ?? undefined}>
        {row.signedByName ?? "Signed"}
      </span>
      <span className="block text-muted-foreground tabular-nums">{phtDisplayStamp(row.signedAt)}</span>
    </span>
  );
}

/** The saved periods. One row per period: the figures the sign-off froze, not a live recalculation. */
export function ReconciliationTable({ rows, isLoading, isFiltered, onSignOff }: Props) {
  return (
    <>
      <div className="hidden overflow-x-auto min-[1300px]:block">
        <table className="w-full min-w-[1240px] border-collapse text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Period</th>
              <th className="px-3 py-2.5 text-right font-medium">Opening</th>
              <th className="px-3 py-2.5 text-right font-medium">New loans</th>
              <th className="px-3 py-2.5 text-right font-medium">Interest &amp; amort.</th>
              <th className="px-3 py-2.5 text-right font-medium">Payments</th>
              <th className="px-3 py-2.5 text-right font-medium">Prepayments</th>
              <th className="px-3 py-2.5 text-right font-medium">Restructures</th>
              <th className="px-3 py-2.5 text-right font-medium">Payoffs</th>
              <th className="px-3 py-2.5 text-right font-medium">Closing</th>
              <th className="px-3 py-2.5 text-right font-medium">Difference</th>
              <th className="px-3 py-2.5 text-left font-medium">Result</th>
              <th className="px-3 py-2.5 text-left font-medium">Signed</th>
              <th className="px-4 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              <tr>
                <td colSpan={COLUMNS} className="p-0">
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-10 w-full" />
                    ))}
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS} className="px-4 py-14 text-center text-sm text-muted-foreground">
                  {isFiltered
                    ? "No saved period matches this filter. Clear it to see every reconciliation."
                    : "No period has been reconciled yet. Build a roll-forward above and save it."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="block text-sm">
                      {row.periodStart} → {row.periodEnd}
                    </span>
                    {row.remarks ? (
                      <span className="block max-w-[220px] truncate text-xs text-muted-foreground" title={row.remarks}>
                        {row.remarks}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right">{money(row.openingBalance)}</td>
                  <td className="px-3 py-2.5 text-right">{money(row.newLoans)}</td>
                  <td className="px-3 py-2.5 text-right">{money(row.interestAmortization)}</td>
                  <td className="px-3 py-2.5 text-right">{money(-row.payments)}</td>
                  <td className="px-3 py-2.5 text-right">{money(-row.partialPrepayments)}</td>
                  <td className="px-3 py-2.5 text-right">{money(-row.restructures)}</td>
                  <td className="px-3 py-2.5 text-right">{money(-row.payoffs)}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{money(row.closingBalance)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className={
                        Math.abs(row.difference) < 0.005
                          ? "tabular-nums"
                          : "tabular-nums text-destructive"
                      }
                    >
                      {peso(row.difference)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={RESULT_TONE[row.result]}>{RESULT_LABEL[row.result]}</StatusBadge>
                  </td>
                  <td className="px-3 py-2.5">{signedLabel(row)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={Boolean(row.signedAt)}
                      title={row.signedAt ? "This period is already signed off" : "Sign off this period"}
                      onClick={() => onSignOff(row)}
                    >
                      {row.signedAt ? "Signed" : "Sign off"}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border min-[1300px]:hidden">
        {isLoading ? (
          <li className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </li>
        ) : rows.length === 0 ? (
          <li className="px-4 py-12 text-center text-sm text-muted-foreground">
            {isFiltered
              ? "No saved period matches this filter."
              : "No period has been reconciled yet. Build a roll-forward above and save it."}
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  {row.periodStart} → {row.periodEnd}
                </span>
                <StatusBadge tone={RESULT_TONE[row.result]}>{RESULT_LABEL[row.result]}</StatusBadge>
              </div>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Opening {peso(row.openingBalance)} · Closing{" "}
                  <span className="font-medium text-foreground">{peso(row.closingBalance)}</span>
                </span>
                <span className="tabular-nums">Difference {peso(row.difference)}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                New loans {peso(row.newLoans)} · interest {peso(row.interestAmortization)} · payments{" "}
                {peso(-row.payments)} · prepayments {peso(-row.partialPrepayments)} · restructures{" "}
                {peso(-row.restructures)} · payoffs {peso(-row.payoffs)}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {row.signedAt
                    ? `${row.signedByName ?? "Signed"} · ${phtDisplayStamp(row.signedAt)}`
                    : "Not signed"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={Boolean(row.signedAt)}
                  onClick={() => onSignOff(row)}
                >
                  {row.signedAt ? "Signed" : "Sign off"}
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
