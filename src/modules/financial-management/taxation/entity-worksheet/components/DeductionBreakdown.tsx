"use client";

import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { ExpenseBreakdown, ExpenseBucket } from "../types";

const BUCKET_LABELS: Record<ExpenseBucket, string> = {
  COST_OF_SALES: "Line 3 · cost of sales",
  DEDUCTIONS: "Line 6 · deduction",
  INCOME_ADJUSTMENT: "Contra-revenue / income adjustment",
  UNCLASSIFIED: "Unclassified (assign COA type)",
  BALANCE_SHEET: "Balance-sheet movement",
};

const BUCKET_CLASSES: Record<ExpenseBucket, string> = {
  COST_OF_SALES: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  DEDUCTIONS: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  INCOME_ADJUSTMENT: "bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300",
  UNCLASSIFIED: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300",
  BALANCE_SHEET: "bg-muted text-muted-foreground ring-border/60",
};

/**
 * Lines 3 and 6 are two numbers; this is where they come from.
 *
 * The disbursement ledger holds every peso that left the bank for the year. Cost of sales and
 * cost of services reach line 3, operating and finance costs reach line 6, and everything else
 * is a balance-sheet movement, so the panel shows all three rather than one pooled total.
 */
export function DeductionBreakdown({ breakdown, year }: { breakdown: ExpenseBreakdown | null; year: number }) {
  if (!breakdown || breakdown.rows.length === 0) {
    return (
      <section
        aria-label="Deduction breakdown"
        className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm"
      >
        <div className="border-b border-border/50 px-4 py-3">
          <h2 className="text-sm font-semibold">How the deduction line is built</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The disbursement view could not be read for {year}, so the account breakdown is not available.
          </p>
        </div>
      </section>
    );
  }

  const excluded = breakdown.rows.filter(
    (row) => row.bucket === "BALANCE_SHEET" || row.bucket === "INCOME_ADJUSTMENT" || row.bucket === "UNCLASSIFIED",
  );
  const excludedTotal = excluded.reduce((sum, row) => sum + row.amount, 0);
  const financeCostsRow = breakdown.rows.find((row) => row.type === "10");
  const unclassifiedRow = breakdown.rows.find((row) => row.bucket === "UNCLASSIFIED");

  return (
    <section
      aria-label="Deduction breakdown"
      className="overflow-hidden rounded-2xl border border-border/50 border-t-[3px] border-t-indigo-500/60 bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">How the deduction line is built</h2>
          <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
            Everything the disbursement ledger carried in {year}, split by the account type each line was booked to.
            Cost of goods sold and cost of services reach line 3; operating expense and finance cost reach line 6.
          </p>
        </div>
        <Badge variant="outline" className="tabular-nums text-[11px]">
          {formatNumber(breakdown.rows.length)} account {breakdown.rows.length === 1 ? "type" : "types"}
        </Badge>
      </div>

      <div className="grid gap-4 border-b border-border/50 px-4 py-3 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total disbursed</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatCurrency(breakdown.total)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cost of sales, line 3</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatCurrency(breakdown.costOfSales)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Deductions, line 6</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatCurrency(breakdown.deductible)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Not a deduction</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-muted-foreground">{formatCurrency(excludedTotal)}</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 pl-5 pr-4 text-left font-medium">
              Account type
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Amount
            </th>
            <th scope="col" className="py-2 pl-4 pr-5 text-right font-medium">
              Where it lands
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {breakdown.rows.map((row) => (
            <tr key={row.type || "unclassified"} className={row.bucket === "BALANCE_SHEET" ? "text-muted-foreground" : undefined}>
              <th scope="row" className="py-2 pl-5 pr-4 text-left font-normal">
                {row.label}
              </th>
              <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(row.amount)}</td>
              <td className="py-2 pl-4 pr-5 text-right">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                    BUCKET_CLASSES[row.bucket],
                  )}
                >
                  {BUCKET_LABELS[row.bucket]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {financeCostsRow && financeCostsRow.amount > 0 ? (
        <div className="border-t border-border/50 bg-amber-500/5 px-4 py-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Finance costs segregated ({formatCurrency(financeCostsRow.amount)}):
          </span>{" "}
          Under NIRC Sec. 34(B)(1) (CREATE Act), deductible interest expense must be reduced by 20% of any
          final-taxed bank interest income earned during {year}. Verify final-taxed bank interest before filing
          1702Q.
        </div>
      ) : null}

      {unclassifiedRow && Math.abs(unclassifiedRow.amount) > 0.005 ? (
        <div className="border-t border-border/50 bg-amber-500/5 px-4 py-3 text-xs text-muted-foreground">
          <span className="font-medium text-amber-700 dark:text-amber-300">
            Unclassified GL postings ({formatCurrency(unclassifiedRow.amount)}):
          </span>{" "}
          Assign a Chart of Accounts type to these ledger lines so valid tax-deductible expenses are not excluded from
          Line 6.
        </div>
      ) : null}

      {breakdown.accounts.length > 0 ? (
        <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Largest deductible accounts</p>
          <ul className="mt-1.5 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {breakdown.accounts.map((account) => (
              <li key={account.title} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate" title={account.title}>
                  {account.title}
                </span>
                <span className="shrink-0 tabular-nums">{formatCurrency(account.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
