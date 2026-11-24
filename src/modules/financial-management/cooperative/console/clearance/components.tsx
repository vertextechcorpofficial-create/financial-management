"use client";

import { ChevronRight } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "../../members/components";
import { peso } from "../../members/format";
import type { ClearanceRegister } from "../../server/clearance-store";
import { caseStatusChip, StatusChip } from "../components/ui";
import { formatDate } from "../format";
import { CLEARANCE_REASONS } from "../types";

type Row = ClearanceRegister["rows"][number];

export function ClearanceRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { documents } = row;
  const missing = [...documents.blocks, ...documents.warnings];
  const documentStatus = documents.blocks.length ? "REJECTED" : documents.warnings.length ? "PARTIAL" : "ACTIVE";
  const owed = row.owed === null ? null : peso(row.owed);

  return (
    <TableRow
      tabIndex={0}
      data-clearance-id={row.id}
      aria-label={`Open clearance ${row.reference}`}
      className="group cursor-pointer transition-colors focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/30"
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <TableCell className="whitespace-normal">
        <p className="font-mono text-sm font-medium">{row.reference}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{CLEARANCE_REASONS[row.reason]}</p>
        <p className="mt-1 text-xs text-muted-foreground lg:hidden">
          {row.member.name} · {row.member.employeeNumber}
          {row.member.department ? ` · ${row.member.department}` : ""}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground lg:hidden">
          Owed {owed ?? "unavailable"} · Savings {peso(row.savings)}
        </p>
      </TableCell>
      <TableCell className="hidden w-60 max-w-60 whitespace-normal lg:table-cell">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={row.member.name} />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.member.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {row.member.employeeNumber}
              {row.member.department && <>
                <span className="mx-1 text-muted-foreground/50">/</span>{row.member.department}
              </>}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden whitespace-nowrap xl:table-cell">{formatDate(row.separationDate)}</TableCell>
      <TableCell className="hidden whitespace-nowrap xl:table-cell">
        {documents.required === 0
          ? <span className="text-xs text-muted-foreground">None required</span>
          : <span title={missing.length ? `Missing: ${missing.join(", ")}` : undefined}>
            <StatusChip status={documentStatus} label={`${documents.onFile}/${documents.required} on file`} />
          </span>}
      </TableCell>
      <TableCell className="hidden text-right font-mono tabular-nums lg:table-cell">
        {owed ?? <span className="text-xs text-muted-foreground">Unavailable</span>}
      </TableCell>
      <TableCell className="hidden text-right font-mono tabular-nums min-[1400px]:table-cell">{peso(row.savings)}</TableCell>
      <TableCell className="whitespace-nowrap">{caseStatusChip(row.status)}</TableCell>
      <TableCell className="hidden sm:table-cell">
        <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      </TableCell>
    </TableRow>
  );
}

export function ClearanceRegisterSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <TableRow key={index} className="hover:bg-transparent">
          <TableCell>
            <div className="space-y-2">
              <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
            </div>
          </TableCell>
          <TableCell className="hidden w-60 max-w-60 lg:table-cell">
            <div className="flex items-center gap-3">
              <div className="size-10 animate-pulse rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </TableCell>
          <TableCell className="hidden xl:table-cell"><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell className="hidden xl:table-cell"><div className="h-5 w-20 animate-pulse rounded-full bg-muted" /></TableCell>
          <TableCell className="hidden lg:table-cell"><div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell className="hidden min-[1400px]:table-cell"><div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="h-5 w-24 animate-pulse rounded-full bg-muted" /></TableCell>
          <TableCell className="hidden sm:table-cell" />
        </TableRow>
      ))}
    </>
  );
}

export function ClearanceDetailSkeleton() {
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

type HistoryEntry = {
  id: string | number;
  text: string;
  actor: string | null;
  at: string;
  reason?: string | null;
  tone?: "emerald" | "rose" | "slate";
};

export function HistoryTimeline({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return <p className="py-6 text-center text-sm text-muted-foreground">No history recorded.</p>;
  return (
    <ol className="space-y-3">
      {entries.map(entry => (
        <li key={entry.id} className="flex gap-3">
          <span className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            entry.tone === "rose" ? "bg-rose-500/70" : entry.tone === "emerald" ? "bg-emerald-500/70" : "bg-slate-400/70",
          )} />
          <div className="min-w-0">
            <p className="text-sm">{entry.text}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {entry.actor ? `${entry.actor} · ` : ""}{entry.at}
            </p>
            {entry.reason && <p className="mt-1 rounded-md bg-muted/40 px-2 py-1 text-xs break-words">{entry.reason}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
