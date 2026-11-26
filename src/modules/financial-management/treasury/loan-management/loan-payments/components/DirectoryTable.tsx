"use client";

import { ChevronRight, Landmark, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

import { LENDER_TYPE_LABEL, LOAN_STATUS_LABEL, LOAN_STATUS_TONE, REPAYMENT_METHOD_LABEL } from "../constants";
import { mdy } from "../pht";
import type { PaymentLoanRow } from "../types";
import { EmptyState } from "./EmptyState";
import { StatusBadge } from "./StatusBadge";

// Raw <th>/<td>, not the ui Table components, so the base padding has to be spelled out here.
const CELL =
  "[&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3";

/** What is due today, said in the smallest number of words that is still true. */
function dueSubtext(row: PaymentLoanRow) {
  if (row.amountDueNow <= 0) return "Settled up to today";
  if (row.overdueCount > 0) {
    return `${row.overdueCount} ${row.overdueCount === 1 ? "installment" : "installments"} overdue`;
  }
  return row.nextDueDate ? `Due ${mdy(row.nextDueDate)}` : "Due today";
}

interface Props {
  rows: PaymentLoanRow[];
  isLoading: boolean;
  isFiltered: boolean;
  onOpen: (row: PaymentLoanRow) => void;
}

export function DirectoryTable({ rows, isLoading, isFiltered, onOpen }: Props) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!isLoading && rows.length === 0) {
    return isFiltered ? (
      <EmptyState
        icon={SearchX}
        title="No loan matches these filters."
        hint="Clear the search, or pick another status or lender type."
      />
    ) : (
      <EmptyState
        icon={Landmark}
        title="No loan has been registered yet."
        hint="Add one in the Loan Register, then come back to record its payments."
      />
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto min-[1300px]:block">
        <table className={`w-full min-w-[1080px] border-collapse text-sm ${CELL}`}>
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left font-medium">Loan</th>
              <th className="text-left font-medium">Lender</th>
              <th className="text-left font-medium">Method</th>
              <th className="text-right font-medium">Principal</th>
              <th className="text-left font-medium">Released</th>
              <th className="text-left font-medium">Maturity</th>
              <th className="text-right font-medium">Amount due now</th>
              <th className="text-left font-medium">Status</th>
              <th className="text-right font-medium">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-muted/40">
                <td>
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    className="block max-w-[220px] truncate text-left font-medium tabular-nums focus-visible:underline focus-visible:outline-none"
                    title={row.loanNo}
                  >
                    {row.loanNo}
                  </button>
                  <div className="max-w-[220px] truncate text-xs text-muted-foreground" title={row.accountNo ?? undefined}>
                    {row.accountNo ?? "No loan account / PN number"}
                  </div>
                </td>
                <td>
                  <div className="max-w-[240px] truncate" title={row.lenderName}>
                    {row.lenderName}
                  </div>
                  <div className="text-xs text-muted-foreground">{LENDER_TYPE_LABEL[row.lenderType] ?? row.lenderType}</div>
                </td>
                <td className="text-muted-foreground">{REPAYMENT_METHOD_LABEL[row.repaymentMethod] ?? row.repaymentMethod}</td>
                <td className="text-right tabular-nums">{formatCurrency(row.principal)}</td>
                <td className="tabular-nums text-muted-foreground">{mdy(row.releaseDate)}</td>
                <td className="tabular-nums text-muted-foreground">{mdy(row.maturityDate)}</td>
                <td className="text-right">
                  <div className="font-medium tabular-nums">{formatCurrency(row.amountDueNow)}</div>
                  <div className="text-xs text-muted-foreground">{dueSubtext(row)}</div>
                </td>
                <td>
                  <StatusBadge tone={LOAN_STATUS_TONE[row.status] ?? "neutral"}>{LOAN_STATUS_LABEL[row.status] ?? row.status}</StatusBadge>
                </td>
                <td className="text-right">
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => onOpen(row)}>
                    Open
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border min-[1300px]:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => onOpen(row)} className="w-full px-4 py-3 text-left">
              <div className="flex items-center justify-between gap-3">
                <span title={row.loanNo} className="truncate font-medium tabular-nums">{row.loanNo}</span>
                <StatusBadge tone={LOAN_STATUS_TONE[row.status] ?? "neutral"}>{LOAN_STATUS_LABEL[row.status] ?? row.status}</StatusBadge>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span title={row.lenderName} className="truncate">{row.lenderName}</span>
                <span className="tabular-nums">{REPAYMENT_METHOD_LABEL[row.repaymentMethod] ?? row.repaymentMethod}</span>
              </div>
              <div className="mt-1 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Amount due</p>
                  <p className="tabular-nums font-medium">{formatCurrency(row.amountDueNow)}</p>
                  <p title={dueSubtext(row)} className="truncate text-xs text-muted-foreground">{dueSubtext(row)}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 pb-1 text-xs font-medium text-primary">
                  Open
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
