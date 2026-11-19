"use client";

import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { LOAN_STATUS_LABEL, LOAN_STATUS_TONE, LENDER_TYPE_LABEL } from "../constants";
import type { LoanListRow } from "../types";
import { StatusBadge } from "./StatusBadge";

const COLUMNS = 6;

function money(value: number): string {
  return formatCurrency(value);
}

function dateLabel(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

export function RegisterTable({
  rows,
  isLoading,
  onOpen,
}: {
  rows: LoanListRow[];
  isLoading: boolean;
  onOpen: (loan: LoanListRow) => void;
}) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-medium">No loan matches these filters.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Clear the search, or record a loan with <span className="font-medium">New loan</span>. A loan starts in
          Pending approval until someone releases it.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto min-[1300px]:block">
        <Table className="[&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Loan</TableHead>
              <TableHead>Lender</TableHead>
              <TableHead className="w-[150px] text-right">Principal</TableHead>
              <TableHead className="w-[150px] text-right">Outstanding</TableHead>
              <TableHead className="w-[140px]">Next due</TableHead>
              <TableHead className="w-[130px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((loan) => (
              <TableRow
                key={loan.id}
                className="cursor-pointer"
                onClick={() => onOpen(loan)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(loan);
                  }
                }}
              >
                <TableCell className="font-medium">
                  <span className="font-mono text-xs">{loan.loan_no}</span>
                </TableCell>
                <TableCell className="max-w-[320px]">
                  <p className="truncate" title={loan.lender_name}>
                    {loan.lender_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {LENDER_TYPE_LABEL[loan.lender_type]}
                    {loan.branch ? ` · ${loan.branch}` : ""}
                  </p>
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(loan.principal)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(loan.outstandingPrincipal)}
                  <span className="block text-xs text-muted-foreground">{money(loan.paidToDate)} paid</span>
                </TableCell>
                <TableCell>
                  {dateLabel(loan.nextDueDate)}
                  {loan.nextDueAmount !== null ? (
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {money(loan.nextDueAmount)}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={LOAN_STATUS_TONE[loan.status]}>{LOAN_STATUS_LABEL[loan.status]}</StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-border min-[1300px]:hidden">
        {rows.map((loan) => (
          <li key={loan.id}>
            <button
              type="button"
              onClick={() => onOpen(loan)}
              className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{loan.loan_no}</span>
                <StatusBadge tone={LOAN_STATUS_TONE[loan.status]}>{LOAN_STATUS_LABEL[loan.status]}</StatusBadge>
              </div>
              <p className="truncate text-sm font-medium" title={loan.lender_name}>
                {loan.lender_name}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {money(loan.principal)} · outstanding {money(loan.outstandingPrincipal)}
              </p>
              <p className="text-xs text-muted-foreground">
                Next due {dateLabel(loan.nextDueDate)}
                {loan.nextDueAmount !== null ? ` · ${money(loan.nextDueAmount)}` : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export { COLUMNS };
