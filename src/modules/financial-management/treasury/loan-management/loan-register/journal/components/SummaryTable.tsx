"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";

import { money } from "../money";
import type { AccountSummaryRow } from "../types";

interface Props {
  rows: AccountSummaryRow[];
  isLoading: boolean;
  isFiltered: boolean;
}

export function SummaryTable({ rows, isLoading, isFiltered }: Props) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-14 text-center text-sm text-muted-foreground">
        {isFiltered
          ? "No account carries a line for these filters. Clear them, or widen the date range."
          : "No loan journal line has been posted yet, so there is nothing to total by account."}
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto min-[1300px]:block">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Account</th>
              <th className="px-4 py-2.5 text-right font-medium">Debit</th>
              <th className="px-4 py-2.5 text-right font-medium">Credit</th>
              <th className="px-4 py-2.5 text-right font-medium">Net</th>
              <th className="px-4 py-2.5 text-right font-medium">Lines</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.coaId} className="transition-colors hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="max-w-[360px] truncate" title={`${row.code} · ${row.title}`}>
                    {row.code} · {row.title}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{money(row.debit)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(row.credit)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{money(row.net)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatNumber(row.lineCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border min-[1300px]:hidden">
        {rows.map((row) => (
          <li key={row.coaId} className="px-4 py-3">
            <div className="break-words font-medium">
              {row.code} · {row.title}
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-sm">
              <span className="text-xs text-muted-foreground">{formatNumber(row.lineCount)} lines</span>
              <span className="tabular-nums">
                {money(row.debit)} / {money(row.credit)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Net</span>
              <span className="tabular-nums font-medium text-foreground">{money(row.net)}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export const SUMMARY_COLUMNS = 5;
