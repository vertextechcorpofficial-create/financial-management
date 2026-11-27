"use client";

import { ChevronRight } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";

import { EXCEPTION_STATUS_LABEL, EXCEPTION_STATUS_TONE } from "../constants";
import { magnitudeText } from "../services/engine";
import { displayDay } from "@/modules/financial-management/management-analytics/shared/dates";
import type { ExceptionListRow } from "../types";

const COLUMNS = 7;

export function formatDeviation(row: ExceptionListRow): string {
  const body = magnitudeText(row.deviation, row.unit, row.dp);
  return `${body} ${row.direction === "UP" ? "above" : "below"}`;
}

export function runLabel(row: ExceptionListRow): string {
  return row.period_start === row.period_end ? row.period_start : `${row.period_start} → ${row.period_end}`;
}

function memoCell(row: ExceptionListRow) {
  if (!row.memo_due_date) return <span className="text-muted-foreground">not set</span>;
  const overdue = ["OPEN", "MONITORING"].includes(row.status) && row.memo_due_date < new Date().toISOString().slice(0, 10);
  return (
    <span className={overdue ? "text-destructive" : undefined} title={overdue ? "The memo deadline has passed." : undefined}>
      {displayDay(row.memo_due_date)}
    </span>
  );
}

export function ExceptionTable({
  rows,
  isLoading,
  onOpen,
}: {
  rows: ExceptionListRow[];
  isLoading: boolean;
  onOpen: (id: number) => void;
}) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-2 p-4" aria-hidden>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-9 animate-pulse rounded-md bg-muted/60" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        No exception matches these filters. Run a scan for the month, or clear the filters.
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto min-[1300px]:block">
        <Table className="min-w-[980px] border-separate border-spacing-0 [&_td]:py-3 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
          <TableHeader>
            <TableRow>
              <TableHead>KPI</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Periods</TableHead>
              <TableHead>Deviation</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Memo due</TableHead>
              <TableHead className="w-[56px] text-right">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${row.kpiName} for ${row.companyCode}`}
                className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset"
                onClick={() => onOpen(row.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(row.id);
                  }
                }}
              >
                <TableCell>
                  <div className="max-w-[260px] truncate text-sm font-medium" title={`${row.kpiName} · ${row.kpiKey}`}>
                    {row.kpiName}
                  </div>
                  <div className="text-xs text-muted-foreground">{row.reason ?? row.kpiKey}</div>
                </TableCell>
                <TableCell className="text-sm">{row.companyCode}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">{runLabel(row)}</TableCell>
                <TableCell className="whitespace-nowrap text-sm tabular-nums">{formatDeviation(row)}</TableCell>
                <TableCell>
                  <StatusBadge tone={EXCEPTION_STATUS_TONE[row.status] ?? "neutral"} title={row.status}>
                    {EXCEPTION_STATUS_LABEL[row.status] ?? row.status}
                  </StatusBadge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm tabular-nums">{memoCell(row)}</TableCell>
                <TableCell className="text-right">
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-border min-[1300px]:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onOpen(row.id)}
              className="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium" title={row.kpiName}>{row.kpiName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.companyCode} · {runLabel(row)}
                  </span>
                </span>
                <StatusBadge tone={EXCEPTION_STATUS_TONE[row.status] ?? "neutral"}>{EXCEPTION_STATUS_LABEL[row.status] ?? row.status}</StatusBadge>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="tabular-nums">{formatDeviation(row)}</span>
                <span>Memo due {row.memo_due_date ? displayDay(row.memo_due_date) : "not set"}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <span className="sr-only" data-columns={COLUMNS} />
    </>
  );
}
