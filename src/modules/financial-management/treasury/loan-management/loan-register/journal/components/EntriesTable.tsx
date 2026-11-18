"use client";

import { AlertTriangle, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { ENTRY_STATUS_LABEL, ENTRY_STATUS_TONE, ENTRY_TYPE_LABEL, ENTRY_TYPE_TONE } from "../constants";
import { money, shortDate } from "../money";
import type { EntryRow } from "../types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  rows: EntryRow[];
  isLoading: boolean;
  isFiltered: boolean;
  onOpen: (row: EntryRow) => void;
}

function BalanceBadge({ row }: { row: EntryRow }) {
  if (row.difference == null) return null;
  return (
    <StatusBadge
      tone="danger"
      title={`${row.differenceNote ?? "it does not balance"} by ${money(Math.abs(row.difference))}`}
      className="mt-1"
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      Does not balance · {money(Math.abs(row.difference))}
    </StatusBadge>
  );
}

export function EntriesTable({ rows, isLoading, isFiltered, onOpen }: Props) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-14 text-center text-sm text-muted-foreground">
        {isFiltered
          ? "No entry matches these filters. Clear them, or widen the date range."
          : "No loan journal entry has been posted yet. An entry appears here once a release, accrual or payment is posted on its loan."}
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto min-[1300px]:block">
        <table className="w-full min-w-[1010px] border-collapse text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Date</th>
              <th className="px-4 py-2.5 text-left font-medium">Entry</th>
              <th className="px-4 py-2.5 text-left font-medium">Loan</th>
              <th className="px-4 py-2.5 text-left font-medium">Type</th>
              <th className="px-4 py-2.5 text-left font-medium">Description</th>
              <th className="px-4 py-2.5 text-right font-medium">Debit</th>
              <th className="px-4 py-2.5 text-right font-medium">Credit</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                role="button"
                aria-label={`Open ${row.entryNo}`}
                onClick={() => onOpen(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(row);
                  }
                }}
                className={`cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                  row.status === "REVERSED" ? "text-muted-foreground" : ""
                }`}
              >
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">{shortDate(row.entryDate)}</td>
                <td className="px-4 py-3">
                  <div className="whitespace-nowrap font-medium tabular-nums">{row.entryNo}</div>
                  {row.reversesEntryNo ? (
                    <div className="text-xs text-muted-foreground">Reverses {row.reversesEntryNo}</div>
                  ) : null}
                  {row.reversedByNo ? (
                    <div className="text-xs text-muted-foreground">Reversed by {row.reversedByNo}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-[150px] truncate" title={`${row.loanNo ?? "—"} · ${row.lenderName ?? "—"}`}>
                    {row.loanNo ?? "—"}
                  </div>
                  <div className="max-w-[150px] truncate text-xs text-muted-foreground">{row.lenderName ?? "—"}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={ENTRY_TYPE_TONE[row.entryType]}>{ENTRY_TYPE_LABEL[row.entryType]}</StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-[160px] truncate" title={row.description || undefined}>
                    {row.description || "—"}
                  </div>
                  <BalanceBadge row={row} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{money(row.totalDebit)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(row.totalCredit)}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={ENTRY_STATUS_TONE[row.status]}>{ENTRY_STATUS_LABEL[row.status]}</StatusBadge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    aria-label={`View lines for ${row.entryNo}`}
                    title="View the posted lines"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(row);
                    }}
                  >
                    <Eye className="h-4 w-4" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border min-[1300px]:hidden">
        {rows.map((row) => (
          <li key={row.id} className={row.status === "REVERSED" ? "text-muted-foreground" : undefined}>
            <button type="button" onClick={() => onOpen(row)} className="w-full px-4 py-3 text-left">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium tabular-nums">{row.entryNo}</span>
                <span className="tabular-nums text-xs">{shortDate(row.entryDate)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                <span className="break-words">{ENTRY_TYPE_LABEL[row.entryType]}</span>
                <StatusBadge tone={ENTRY_STATUS_TONE[row.status]}>{ENTRY_STATUS_LABEL[row.status]}</StatusBadge>
              </div>
              <div className="mt-1 break-words text-sm">{row.description || "No description"}</div>
              <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-xs text-muted-foreground">
                  {row.loanNo ?? "—"} · {row.lenderName ?? "—"}
                </span>
                <span className="whitespace-nowrap tabular-nums">
                  {money(row.totalDebit)} / {money(row.totalCredit)}
                </span>
              </div>
              {row.difference == null ? null : (
                <div className="mt-1 text-xs text-destructive">
                  Does not balance · {money(Math.abs(row.difference))}
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export const ENTRY_COLUMNS = 9;
