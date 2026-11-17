"use client";

import { ChevronRight, LoaderCircle } from "lucide-react";

import { formatCurrency } from "@/lib/utils";

import { LOAN_STATUS_LABEL, LOAN_STATUS_TONE } from "../constants";
import { daysWaiting } from "../format";
import { StatusBadge } from "./StatusBadge";
import type { ApprovalQueueRow } from "../types";

/** The clock time it was submitted, so two loans filed minutes apart read apart. The wait rides beside it. */
function waitingLine(row: ApprovalQueueRow): string {
  if (row.submittedAt === null) return "Submission date not recorded";
  const days = daysWaiting(row.submittedAt);
  const stamp = row.submittedAt.slice(0, 16).replace("T", " ");
  return days <= 0 ? stamp : `${stamp} · ${days} day${days === 1 ? "" : "s"}`;
}

export function ApprovalsTable({
  rows,
  isLoading,
  onOpen,
}: {
  rows: ApprovalQueueRow[];
  isLoading: boolean;
  onOpen: (row: ApprovalQueueRow) => void;
}) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        Reading the approvals queue…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
        <p className="text-sm font-medium">Nothing is waiting for a decision.</p>
        <p className="text-xs text-muted-foreground">
          Loans reach this queue when the register submits them for approval.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto min-[1300px]:block">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-[128px] px-3 py-2 text-left font-medium">Loan no.</th>
              <th className="px-3 py-2 text-left font-medium">Lender</th>
              <th className="w-[132px] px-3 py-2 text-right font-medium">Principal</th>
              <th className="w-[132px] px-3 py-2 text-right font-medium">Net proceeds</th>
              <th className="w-[168px] px-3 py-2 text-left font-medium">Decision</th>
              <th className="w-[148px] px-3 py-2 text-left font-medium">Waiting</th>
              <th className="w-[40px] px-3 py-2 text-right font-medium">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const blocker = row.status === "PENDING_RELEASE" ? row.releaseBlockedReason : null;
              return (
                <tr
                  key={row.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => onOpen(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(row);
                    }
                  }}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                >
                  <td className="px-3 py-2">
                    <span className="block truncate font-medium tabular-nums" title={row.loanNo}>
                      {row.loanNo}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="block truncate" title={row.lenderName}>
                      {row.lenderName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.branch ?? "No branch recorded"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.principal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.proceedsNet)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={LOAN_STATUS_TONE[row.status]}>{LOAN_STATUS_LABEL[row.status]}</StatusBadge>
                    {blocker ? (
                      <p className="mt-1 line-clamp-2 text-[11px] text-amber-700 dark:text-amber-400" title={blocker}>
                        {blocker}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground" title={row.submittedAt ?? undefined}>
                    {waitingLine(row)}
                    {row.submittedByName ? (
                      <span className="mt-0.5 block max-w-[140px] truncate" title={row.submittedByName}>
                        by {row.submittedByName}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border min-[1300px]:hidden">
        {rows.map((row) => {
          const blocker = row.status === "PENDING_RELEASE" ? row.releaseBlockedReason : null;
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onOpen(row)}
                className="flex min-h-11 w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/40"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium tabular-nums" title={row.loanNo}>
                    {row.loanNo}
                  </span>
                  <StatusBadge tone={LOAN_STATUS_TONE[row.status]}>{LOAN_STATUS_LABEL[row.status]}</StatusBadge>
                </span>
                <span className="truncate text-xs text-muted-foreground" title={row.lenderName}>
                  {row.lenderName}
                </span>
                <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  <span className="tabular-nums">{formatCurrency(row.principal)}</span>
                  <span className="tabular-nums text-muted-foreground">{formatCurrency(row.proceedsNet)} net</span>
                  <span className="text-muted-foreground">
                    {waitingLine(row)}
                    {row.submittedByName ? ` · by ${row.submittedByName}` : ""}
                  </span>
                </span>
                {blocker ? (
                  <span className="line-clamp-2 text-[11px] text-amber-700 dark:text-amber-400">{blocker}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
