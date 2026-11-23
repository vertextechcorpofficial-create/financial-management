"use client";

import { ChevronRight, HandCoins, Landmark } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { StatusChip } from "../console/components/ui";
import { PersonAvatar } from "../members/components";
import { date, peso } from "../members/format";
import type { ApprovalQueue } from "../server/approvals";

type Row = ApprovalQueue["rows"][number];

export function ApprovalRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const typeLabel = row.type === "loan" ? "Loan" : "Withdrawal";
  const TypeIcon = row.type === "loan" ? HandCoins : Landmark;
  const chipStatus = row.released ? "ACTIVE" : row.status;
  const label = row.status === "APPROVED" ? row.released ? "Released" : "For release" : undefined;

  return (
    <TableRow
      tabIndex={0}
      aria-label={`Open ${typeLabel} ${row.reference}`}
      className="group cursor-pointer transition-colors focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/30"
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <TableCell className="hidden whitespace-nowrap md:table-cell">{date(row.filedAt)}</TableCell>
      <TableCell className="hidden whitespace-nowrap lg:table-cell">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <TypeIcon className="size-3.5 text-muted-foreground" /> {typeLabel}
        </span>
      </TableCell>
      <TableCell className="whitespace-normal">
        <p className="font-mono text-sm font-medium">{row.reference}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground lg:hidden">
          <span>{typeLabel}</span>
          <span className="sm:hidden"><span className="mx-1.5 text-muted-foreground/50">·</span><span className="font-mono tabular-nums">{peso(row.amount)}</span></span>
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground sm:hidden">
          {row.memberName}{row.memberNo ? ` · ${row.memberNo}` : ""}
        </p>
      </TableCell>
      <TableCell className="hidden whitespace-normal sm:table-cell">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={row.memberName} />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.memberName}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {row.memberNo ?? "No member no."}
              {row.department && <><span className="mx-1 text-muted-foreground/50">/</span>{row.department}</>}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden whitespace-nowrap lg:table-cell">
        {row.type !== "loan"
          ? <span className="text-xs text-muted-foreground">—</span>
          : !row.documents
            ? <span className="text-xs text-muted-foreground">—</span>
            : row.documents.required.length === 0
              ? <span className="whitespace-nowrap text-xs text-muted-foreground">None required</span>
              : row.documents.missing.length === 0
                ? <StatusChip status="ACTIVE" label="Complete" />
                : <StatusChip status="PARTIAL" label={`${row.documents.done.length}/${row.documents.required.length}`} />}
      </TableCell>
      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">{peso(row.amount)}</TableCell>
      <TableCell className="whitespace-nowrap">
        <StatusChip status={chipStatus} label={label} />
      </TableCell>
      <TableCell>
        <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      </TableCell>
    </TableRow>
  );
}

export function ApprovalQueueSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <TableRow key={index} className="hover:bg-transparent">
          <TableCell className="hidden md:table-cell"><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell className="hidden lg:table-cell"><div className="h-4 w-16 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell>
            <div className="space-y-2">
              <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-32 animate-pulse rounded bg-muted" />
            </div>
          </TableCell>
          <TableCell className="hidden sm:table-cell">
            <div className="flex items-center gap-3">
              <div className="size-10 animate-pulse rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </TableCell>
          <TableCell className="hidden lg:table-cell"><div className="h-5 w-16 animate-pulse rounded-full bg-muted" /></TableCell>
          <TableCell className="hidden sm:table-cell"><div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="h-5 w-20 animate-pulse rounded-full bg-muted" /></TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  );
}

export function ApprovalDetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl border bg-muted/40" />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-56 animate-pulse rounded-xl border bg-muted/30" />
        <div className="h-56 animate-pulse rounded-xl border bg-muted/30" />
      </div>
    </div>
  );
}

export function HistoryTimeline({ entries }: { entries: Array<{ date: string; text: string; actor: string | null }> }) {
  if (!entries.length) return <p className="py-6 text-center text-sm text-muted-foreground">No history recorded.</p>;
  return (
    <ol className="space-y-3">
      {entries.map((entry, index) => (
        <li key={`${entry.date}-${index}`} className="flex gap-3">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500/70" />
          <div className="min-w-0">
            <p className="text-sm">{entry.text}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {date(entry.date)}{entry.actor ? ` · ${entry.actor}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
