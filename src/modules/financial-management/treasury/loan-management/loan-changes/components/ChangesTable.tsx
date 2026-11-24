"use client";

import { FileClock, SearchX } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

import { formatDateMDY } from "../pht";
import { CHANGE_KIND_LABEL, CHANGE_KIND_TONE, CHANGE_STATUS_LABEL, CHANGE_STATUS_TONE } from "../constants";
import type { ChangeListRow } from "../types";
import { StatusBadge } from "./StatusBadge";

const COLUMNS = 8;

function stamp(value: string | null) {
  return formatDateMDY(value);
}

function money(value: number | null) {
  return value === null ? "not recorded" : formatCurrency(value);
}

interface Props {
  rows: ChangeListRow[];
  isLoading: boolean;
  isFiltered: boolean;
  onOpen: (row: ChangeListRow) => void;
}

export function ChangesTable({ rows, isLoading, isFiltered, onOpen }: Props) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <Skeleton key={key} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!isLoading && rows.length === 0) {
    const Icon = isFiltered ? SearchX : FileClock;
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">{isFiltered ? "No change matches these filters." : "No change has been recorded yet."}</p>
        <p className="text-sm text-muted-foreground">
          {isFiltered
            ? "Clear the search or widen the dates."
            : "Record a prepayment, rate change, restructure or payoff to see it here."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto min-[1300px]:block">
        <table className="w-full min-w-[1040px] border-collapse text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Effective</th>
              <th className="px-4 py-2.5 text-left font-medium">Change</th>
              <th className="px-4 py-2.5 text-left font-medium">Loan</th>
              <th className="px-4 py-2.5 text-left font-medium">Kind</th>
              <th className="px-4 py-2.5 text-right font-medium">Installment</th>
              <th className="px-4 py-2.5 text-left font-medium">Maturity</th>
              <th className="px-4 py-2.5 text-right font-medium">Gain / loss</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
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
                className={`cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none ${
                  row.status === "REVERSED" ? "text-muted-foreground" : ""
                }`}
              >
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{stamp(row.effectiveDate)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium tabular-nums">{row.changeNo}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.amount !== null ? formatCurrency(row.amount) : row.newRate !== null ? `${row.newRate}%` : "not recorded"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-[200px] truncate" title={`${row.loanNo ?? ""} ${row.lenderName ?? ""}`}>
                    {row.loanNo ?? "not recorded"}
                  </div>
                  <div title={row.lenderName ?? "not recorded"} className="max-w-[200px] truncate text-xs text-muted-foreground">{row.lenderName ?? "not recorded"}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={CHANGE_KIND_TONE[row.kind]}>{CHANGE_KIND_LABEL[row.kind]}</StatusBadge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <div>{money(row.newInstallment)}</div>
                  {row.oldInstallment !== null && row.newInstallment !== null && row.oldInstallment !== row.newInstallment ? (
                    <div className="text-xs text-muted-foreground">from {formatCurrency(row.oldInstallment)}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  <div>{stamp(row.newMaturity)}</div>
                  {row.oldMaturity && row.newMaturity && row.oldMaturity !== row.newMaturity ? (
                    <div className="text-xs text-muted-foreground">from {stamp(row.oldMaturity)}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{row.gainLoss === 0 ? "none" : formatCurrency(row.gainLoss)}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={CHANGE_STATUS_TONE[row.status]} title={row.entryNo ? `Entry ${row.entryNo}` : undefined}>
                    {CHANGE_STATUS_LABEL[row.status]}
                  </StatusBadge>
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
                <span className="font-medium tabular-nums">{row.changeNo}</span>
                <StatusBadge tone={CHANGE_STATUS_TONE[row.status]}>{CHANGE_STATUS_LABEL[row.status]}</StatusBadge>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate">
                  {row.loanNo ?? "not recorded"} · {row.lenderName ?? "not recorded"}
                </span>
                <StatusBadge tone={CHANGE_KIND_TONE[row.kind]}>{CHANGE_KIND_LABEL[row.kind]}</StatusBadge>
              </div>
              {/* The card carries the same facts as the row it stands in for, each with its label. */}
              <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">Effective</span>
                <span className="text-right tabular-nums">{stamp(row.effectiveDate)}</span>
                <span className="text-muted-foreground">Installment</span>
                <span className="text-right tabular-nums">
                  {money(row.newInstallment)}
                  {row.oldInstallment !== null && row.newInstallment !== null && row.oldInstallment !== row.newInstallment ? (
                    <span className="block text-muted-foreground">was {formatCurrency(row.oldInstallment)}</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground">Maturity</span>
                <span className="text-right tabular-nums">
                  {stamp(row.newMaturity)}
                  {row.oldMaturity && row.newMaturity && row.oldMaturity !== row.newMaturity ? (
                    <span className="block text-muted-foreground">was {stamp(row.oldMaturity)}</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground">Gain / loss</span>
                <span className="text-right tabular-nums">{row.gainLoss === 0 ? "none" : formatCurrency(row.gainLoss)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export { COLUMNS };
