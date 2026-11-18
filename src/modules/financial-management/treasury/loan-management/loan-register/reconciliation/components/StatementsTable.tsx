"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

import type { StatementRow } from "../types";
import { STATEMENT_RESULT_LABEL, STATEMENT_RESULT_TONE } from "../constants";
import { StatusBadge } from "./StatusBadge";

const COLUMNS = 9;

type Props = {
  rows: StatementRow[];
  isLoading: boolean;
  isFiltered: boolean;
};

/** Lender figure on top, ours underneath. A reader comparing a statement needs both on one line. */
function Pair({ lender, ours }: { lender: number; ours: number }) {
  const delta = Number((lender - ours).toFixed(2));
  const tone =
    Math.abs(delta) < 0.005
      ? "text-muted-foreground"
      : delta > 0
        ? "text-destructive"
        : "text-destructive";
  return (
    <span className="block whitespace-nowrap text-right">
      <span className="block tabular-nums">{formatCurrency(lender)}</span>
      <span className={`block text-xs tabular-nums ${tone}`} title={`Ours ${formatCurrency(ours)}`}>
        ours {formatCurrency(ours)}
      </span>
    </span>
  );
}

function varianceText(row: StatementRow) {
  const pairs: [string, number, number][] = [
    ["Principal", row.lenderPrincipal, row.ourPrincipal],
    ["Interest", row.lenderInterest, row.ourInterest],
    ["Penalties", row.lenderPenalties, row.ourPenalties],
    ["Advances", row.lenderAdvances, row.ourAdvances],
  ];
  const differing = pairs
    .map(([label, lender, ours]) => [label, Number((lender - ours).toFixed(2))] as const)
    .filter(([, delta]) => Math.abs(delta) >= 0.005);
  if (differing.length === 0) return "—";
  return differing.map(([label, delta]) => `${label} ${formatCurrency(delta)}`).join(" · ");
}

export function StatementsTable({ rows, isLoading, isFiltered }: Props) {
  return (
    <>
      <div className="hidden overflow-x-auto min-[1300px]:block">
        <table className="w-full min-w-[1180px] border-collapse text-sm">
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
              <th className="px-4 py-2.5 text-left font-medium">Variance</th>
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
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{row.statementDate}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{row.loanNo}</td>
                  <td className="px-3 py-2.5">
                    <span className="block max-w-[180px] truncate" title={row.lenderName ?? undefined}>
                      {row.lenderName ?? "—"}
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
                  <td className="px-4 py-2.5">
                    <span className="block max-w-[240px] truncate text-xs" title={varianceText(row)}>
                      {varianceText(row)}
                    </span>
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
            <li key={row.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium tabular-nums">{row.statementDate}</span>
                <StatusBadge tone={STATEMENT_RESULT_TONE[row.result]}>{STATEMENT_RESULT_LABEL[row.result]}</StatusBadge>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {row.loanNo} · {row.lenderName ?? "—"}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {(
                  [
                    ["Principal", row.lenderPrincipal, row.ourPrincipal],
                    ["Interest", row.lenderInterest, row.ourInterest],
                    ["Penalties", row.lenderPenalties, row.ourPenalties],
                    ["Advances", row.lenderAdvances, row.ourAdvances],
                  ] as const
                ).map(([label, lender, ours]) => (
                  <div key={label} className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right tabular-nums">
                      {formatCurrency(lender)}
                      <span className="block text-muted-foreground">ours {formatCurrency(ours)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-1 text-xs text-muted-foreground">Variance: {varianceText(row)}</p>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
