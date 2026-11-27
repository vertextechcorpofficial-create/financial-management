"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatCurrency, cn } from "@/lib/utils";

import { formatDateMDY, phtDisplayStamp } from "../pht";
import type { ReconciliationRow } from "../types";
import { RECONCILIATION_TOLERANCE, RESULT_LABEL, RESULT_TONE } from "../constants";
import { StatusBadge } from "./StatusBadge";

/** A snapshot is only true for the ledger it was taken from. */
const STALE_TITLE =
  "Postings dated inside this period were recorded after it was saved, so these figures no longer describe the ledger. Rebuild the period before signing it off.";

const COLUMNS = 7;

type Props = {
  rows: ReconciliationRow[];
  isLoading: boolean;
  isFiltered: boolean;
  onSignOff: (row: ReconciliationRow) => void;
  onOpen: (row: ReconciliationRow) => void;
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
      {/* Wraps rather than truncates: a clipped name is unreadable and the signature is the point. */}
      <span className="block break-words" title={row.signedByName ?? undefined}>
        {row.signedByName ?? "Signed"}
      </span>
      <span className="block text-muted-foreground tabular-nums">{phtDisplayStamp(row.signedAt)}</span>
    </span>
  );
}

/** The buckets that moved the period, kept on one line so no money leaves the face of the table. */
function movementLabel(row: ReconciliationRow): string {
  const moved = MOBILE_MOVEMENT.map((bucket) => [bucket.label.toLowerCase(), bucket.pick(row)] as const).filter(
    ([, amount]) => Math.abs(amount) >= 0.005,
  );
  if (moved.length === 0) return "No movement in this period";
  return moved.map(([label, amount]) => `${label} ${peso(amount)}`).join(" \u00b7 ");
}

/** The six buckets, shared by the desktop line and the 375 card so the two cannot drift. */
const MOBILE_MOVEMENT: Array<{ label: string; pick: (row: ReconciliationRow) => number }> = [
  { label: "New loans", pick: (row) => row.newLoans },
  { label: "Interest", pick: (row) => row.interestAmortization },
  { label: "Payments", pick: (row) => -row.payments },
  { label: "Prepayments", pick: (row) => -row.partialPrepayments },
  { label: "Restructures", pick: (row) => -row.restructures },
  { label: "Payoffs", pick: (row) => -row.payoffs },
];

/** The saved periods. One row per period: the figures the sign-off froze, not a live recalculation. */
export function ReconciliationTable({ rows, isLoading, isFiltered, onSignOff, onOpen }: Props) {
  return (
    <>
      <div className="hidden overflow-x-auto min-[1300px]:block">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Period and movement</th>
              <th className="px-3 py-2.5 text-right font-medium">Opening</th>
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
                <tr
                  key={row.id}
                  className="cursor-pointer transition-colors hover:bg-muted/30"
                  onClick={() => onOpen(row)}
                >
                  <td className="px-4 py-2.5">
                    <span className="block whitespace-nowrap text-sm">
                      {formatDateMDY(row.periodStart)} → {formatDateMDY(row.periodEnd)}
                    </span>
                    <span className="block max-w-[360px] truncate text-xs tabular-nums text-muted-foreground" title={movementLabel(row)}>
                      {movementLabel(row)}
                    </span>
                    {row.remarks ? (
                      <span className="block max-w-[360px] truncate text-xs text-muted-foreground" title={row.remarks}>
                        {row.remarks}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right">{money(row.openingBalance)}</td>
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge tone={RESULT_TONE[row.result]}>{RESULT_LABEL[row.result]}</StatusBadge>
                      {row.stale ? (
                        <StatusBadge tone="warning" title={STALE_TITLE}>
                          Out of date
                        </StatusBadge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{signedLabel(row)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={Boolean(row.signedAt) || row.stale}
                      title={
                        row.signedAt
                          ? "This period is already signed off"
                          : row.stale
                            ? "Rebuild this period before signing it off: postings recorded after it was saved have moved the ledger."
                            : "Sign off this period"
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        onSignOff(row);
                      }}
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
            <li
              key={row.id}
              className="cursor-pointer px-4 py-3 transition-colors hover:bg-muted/30"
              onClick={() => onOpen(row)}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium tabular-nums">
                  {formatDateMDY(row.periodStart)} → {formatDateMDY(row.periodEnd)}
                </span>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {row.stale ? (
                    <StatusBadge tone="warning" title={STALE_TITLE}>
                      Out of date
                    </StatusBadge>
                  ) : null}
                  <StatusBadge tone={RESULT_TONE[row.result]}>{RESULT_LABEL[row.result]}</StatusBadge>
                </span>
              </div>
              {/* One figure per line: the old card joined Opening, Closing and Difference into a
                  sentence that wrapped mid-amount on a 375 screen. */}
              <dl className="mt-2 space-y-1 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">Opening</dt>
                  <dd className="tabular-nums">{peso(row.openingBalance)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">Closing</dt>
                  <dd className="font-medium tabular-nums">{peso(row.closingBalance)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">Difference</dt>
                  <dd
                    className={cn(
                      "tabular-nums",
                      Math.abs(row.difference) < RECONCILIATION_TOLERANCE ? "" : "font-medium text-destructive",
                    )}
                  >
                    {peso(row.difference)}
                  </dd>
                </div>
              </dl>
              {/* Labelled pairs, not a sentence: on a 375 screen the prose form wrapped every
                  amount onto its own line and read as one run-on figure. */}
              <dl className="mt-1.5 grid grid-cols-2 gap-x-4 text-xs">
                {MOBILE_MOVEMENT.map((bucket) => {
                  const value = bucket.pick(row);
                  if (Math.abs(value) < RECONCILIATION_TOLERANCE) return null;
                  return (
                    <div key={bucket.label} className="flex items-baseline justify-between gap-2">
                      <dt className="shrink-0 text-muted-foreground">{bucket.label}</dt>
                      <dd className="truncate text-right tabular-nums">{peso(value)}</dd>
                    </div>
                  );
                })}
              </dl>
              {MOBILE_MOVEMENT.every((bucket) => Math.abs(bucket.pick(row)) < RECONCILIATION_TOLERANCE) ? (
                <p className="mt-1.5 text-xs text-muted-foreground">No movement in this period.</p>
              ) : null}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="min-w-0 break-words text-xs text-muted-foreground">
                  {row.signedAt
                    ? `${row.signedByName ?? "Signed"} · ${phtDisplayStamp(row.signedAt)}`
                    : "Not signed"}
                </span>
                {/* The pill beside the period already says Reconciled, so a signed row shows the
                    signature line only; the action appears while it can still be taken. */}
                {row.signedAt ? null : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    disabled={row.stale}
                    title={row.stale ? "Rebuild this period before signing it off." : undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSignOff(row);
                    }}
                  >
                    Sign off
                  </Button>
                )}
              </div>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
