"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { PersonAvatar } from "../../members/components";
import { date, peso } from "../../members/format";
import type { TransactionJournal } from "../../server/transaction-journal";
import { channelLabels, transactionLabels } from "../../transactions/entries";
import { savingsReceiptUrl } from "../../transactions/SavingsDepositDialog";

type Row = TransactionJournal["rows"][number];

export function JournalTableRow({
  row,
  paymentEndpoint,
  onRemittance,
  onReverse,
  onSettlement,
}: {
  row: Row;
  paymentEndpoint: string;
  onRemittance: (batchId: number) => void;
  onReverse: (row: Row) => void;
  onSettlement: (id: number) => void;
}) {
  const outgoing = row.amount.startsWith("-");
  const typeLabel = row.kind === "LOAN_PAYMENT" && row.reversed ? "Reversed payment" : transactionLabels[row.kind];
  const references = [...new Set([row.orNo, row.sourceReference, row.reference, row.journalNo]
    .filter((value): value is string => Boolean(value)))];
  const canPrintDeposit = row.depositJournalId !== null;
  const canPrintPayment = Boolean(row.orNo && row.paymentId !== null && row.loanId !== null);
  const canViewRemittance = row.remittanceBatchId !== null;
  const canReverse = row.kind === "LOAN_PAYMENT" && row.paymentId !== null && row.loanId !== null &&
    !row.reversed && !row.remittanceBatchId;
  const canReverseSettlement = row.settlementId !== null && !row.settlementReversed;
  const hasActions = canPrintDeposit || canPrintPayment || canViewRemittance || canReverse || canReverseSettlement;

  return (
    <TableRow className="hover:bg-muted/30">
      <TableCell className="hidden whitespace-nowrap md:table-cell">
        {date(row.businessDate)}
        {row.receiptDate && row.businessDate !== row.receiptDate && (
          <span className="mt-0.5 block text-xs text-muted-foreground">Received {date(row.receiptDate)}</span>
        )}
      </TableCell>
      <TableCell className="hidden whitespace-normal sm:table-cell">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={row.memberName} />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.memberName}</p>
            {row.employeeNo && <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.employeeNo}</p>}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden whitespace-nowrap lg:table-cell">{typeLabel}</TableCell>
      <TableCell className="hidden whitespace-nowrap lg:table-cell">{channelLabels[row.channel]}</TableCell>
      <TableCell className="min-w-0 whitespace-normal">
        <div className="flex flex-col gap-0.5 font-mono text-[11px] leading-4">
          {references.map(reference => <span key={reference} className="break-all">{reference}</span>)}
          {row.originalJournal && <span className="text-muted-foreground">Reverses {row.originalJournal}</span>}
          {row.settlementReversed && <span className="text-muted-foreground">Settlement reversed</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="md:hidden">{date(row.businessDate)}</span>
          <span className="lg:hidden">{typeLabel}</span>
          <span className="lg:hidden">{channelLabels[row.channel]}</span>
          <span className="sm:hidden">{row.memberName}{row.employeeNo ? ` · ${row.employeeNo}` : ""}</span>
          <span className={`font-mono tabular-nums sm:hidden ${outgoing ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-300"}`}>
            {peso(row.amount)}
          </span>
        </div>
      </TableCell>
      <TableCell className={`hidden text-right font-mono tabular-nums sm:table-cell ${outgoing ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-300"}`}>
        {peso(row.amount)}
      </TableCell>
      <TableCell className="text-right">
        {hasActions ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Transaction actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {canPrintDeposit && (
                <DropdownMenuItem asChild>
                  <a href={savingsReceiptUrl(row.depositJournalId!)} target="_blank" rel="noreferrer">Print official receipt</a>
                </DropdownMenuItem>
              )}
              {canPrintPayment && (
                <DropdownMenuItem asChild>
                  <a href={`${paymentEndpoint}/${row.loanId}?receipt=${row.paymentId}`} target="_blank" rel="noreferrer">Print payment receipt</a>
                </DropdownMenuItem>
              )}
              {canViewRemittance && (
                <DropdownMenuItem onSelect={() => onRemittance(row.remittanceBatchId!)}>View remittance</DropdownMenuItem>
              )}
              {canReverse && <DropdownMenuItem onSelect={() => onReverse(row)}>Reverse payment</DropdownMenuItem>}
              {canReverseSettlement && <DropdownMenuItem onSelect={() => onSettlement(row.settlementId!)}>Review settlement reversal</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </TableCell>
    </TableRow>
  );
}

export function JournalSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <TableRow key={index} className="hover:bg-transparent">
          <TableCell className="hidden md:table-cell"><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell className="hidden sm:table-cell">
            <div className="flex items-center gap-3">
              <div className="size-10 animate-pulse rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </TableCell>
          <TableCell className="hidden lg:table-cell"><div className="h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell className="hidden lg:table-cell"><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell>
            <div className="space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
            </div>
          </TableCell>
          <TableCell className="hidden sm:table-cell"><div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="ml-auto size-8 animate-pulse rounded bg-muted" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}
