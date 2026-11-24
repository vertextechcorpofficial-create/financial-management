"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, cn } from "@/lib/utils";

import type { StatementRow } from "../types";
import { STATEMENT_RESULT_LABEL, STATEMENT_RESULT_TONE, RECONCILIATION_TOLERANCE } from "../constants";
import { formatDateMDY } from "../pht";
import { StatusBadge } from "./StatusBadge";

const COLUMNS = 9;

type Props = {
  rows: StatementRow[];
  isLoading: boolean;
  isFiltered: boolean;
  onOpen: (row: StatementRow) => void;
};

/** The four figures a lender statement and our schedule can disagree on. */
function metricPairs(row: StatementRow): Array<[string, number, number]> {
  return [
    ["Principal", row.lenderPrincipal, row.ourPrincipal],
    ["Interest", row.lenderInterest, row.ourInterest],
    ["Penalties", row.lenderPenalties, row.ourPenalties],
    ["Advances", row.lenderAdvances, row.ourAdvances],
  ];
}

/** Only the metrics that moved; an agreeing statement says so in one word. */
function differingPairs(row: StatementRow): Array<readonly [string, number]> {
  return metricPairs(row)
    .map(([label, lender, ours]) => [label, Number((lender - ours).toFixed(2))] as const)
    .filter(([, delta]) => Math.abs(delta) >= RECONCILIATION_TOLERANCE);
}

/** One labelled delta per line: three figures in one truncated sentence is a tooltip, not a column. */
function VarianceLines({ row }: { row: StatementRow }) {
  const differing = differingPairs(row);
  if (differing.length === 0) return <span className="text-xs text-muted-foreground">none</span>;
  return (
    <dl className="space-y-0.5 text-xs">
      {differing.map(([label, delta]) => (
        <div key={label} className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="shrink-0 tabular-nums text-destructive">{formatCurrency(delta)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Lender figure on top, ours underneath. A reader comparing a statement needs both on one line. */
function Pair({ lender, ours }: { lender: number; ours: number }) {
  const differs = Math.abs(lender - ours) >= RECONCILIATION_TOLERANCE;
  return (
    <span className="block whitespace-nowrap text-right">
      <span className="block tabular-nums">{formatCurrency(lender)}</span>
      <span
        className={cn("block text-xs tabular-nums", differs ? "text-destructive" : "text-muted-foreground")}
        title={`Ours ${formatCurrency(ours)}`}
      >
        ours {formatCurrency(ours)}
      </span>
    </span>
  );
}

export function StatementsTable({ rows, isLoading, isFiltered, onOpen }: Props) {
  return (
    <>
      <div className="hidden overflow-x-auto min-[1300px]:block">
        {/* No min-width: the nine columns are sized by content and the variance cell wraps, so the
            table fits the 1384 content width instead of pushing VARIANCE past the edge. */}
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Statement date</th>
              <th className="px-3 py-2.5 text-left font-medium">Loan</th>
              <th className="px-3 py-2.5 text-left font-medium">Lender</th>
              <th className="px-3 py-2.5 text-right font-medium">Principal</th>
              <th className="px-3 py-2.5 text-right font-medium">Interest</th>
              <th className="px-3 py-2.5 text-right font-medium">Penalties</th>
              <th className="px-3 py-2.5 text-right font-medium">Advances</th>
              <th className="px-3 py-2.5 text-left font-medium">Result</th>
              <th className="w-[190px] px-4 py-2.5 text-left font-medium">Variance</th>
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
                    ? "No statement matches this filter. Clear it to see every comparison."
                    : "No lender statement has been recorded yet. Record one to compare it against our figures."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer transition-colors hover:bg-muted/30"
                  onClick={() => onOpen(row)}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{formatDateMDY(row.statementDate)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{row.loanNo}</td>
                  <td className="px-3 py-2.5">
                    <span className="block max-w-[140px] truncate" title={row.lenderName ?? undefined}>
                      {row.lenderName ?? "not recorded"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Pair lender={row.lenderPrincipal} ours={row.ourPrincipal} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Pair lender={row.lenderInterest} ours={row.ourInterest} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Pair lender={row.lenderPenalties} ours={row.ourPenalties} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Pair lender={row.lenderAdvances} ours={row.ourAdvances} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={STATEMENT_RESULT_TONE[row.result]}>{STATEMENT_RESULT_LABEL[row.result]}</StatusBadge>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <VarianceLines row={row} />
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
              ? "No statement matches this filter."
              : "No lender statement has been recorded yet."}
          </li>
        ) : (
          rows.map((row) => (
            <li
              key={row.id}
              role="presentation"
              className="cursor-pointer px-4 py-3 transition-colors hover:bg-muted/30"
              onClick={() => onOpen(row)}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium tabular-nums">{formatDateMDY(row.statementDate)}</span>
                <StatusBadge tone={STATEMENT_RESULT_TONE[row.result]}>{STATEMENT_RESULT_LABEL[row.result]}</StatusBadge>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {row.loanNo} · {row.lenderName ?? "not recorded"}
              </div>
              {/* One shape per metric: label on its own line, then the lender figure, then ours. The
                  old label-beside-value row wrapped per card, so the pair columns never lined up. */}
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {metricPairs(row).map(([label, lender, ours]) => {
                  const differs = Math.abs(lender - ours) >= RECONCILIATION_TOLERANCE;
                  return (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="tabular-nums">{formatCurrency(lender)}</dd>
                      <dd
                        className={cn(
                          "text-[11px] tabular-nums",
                          differs ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        ours {formatCurrency(ours)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <div className="mt-2 text-xs">
                <p className="text-muted-foreground">Variance</p>
                <VarianceLines row={row} />
              </div>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
