"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";

import { toneClass } from "../constants";
import {
  previewDepositSlip,
  type DepositPreview as DepositPreviewResponse,
} from "../providers/depositApi";
import type { ResolvedJournalEntry } from "../types";

interface Props {
  bankAccountId: number | null;
  cashTotal: number;
  /** Cheques on the same slip. They post E12 to clearing, so they get their own entry. */
  checkTotal?: number;
}

/**
 * Live posting preview. The server resolves every line the posting path will use, so this panel
 * lists each entry (E07 for cash, E12 for cheques) and reports unmapped GL keys instead of
 * inventing accounts.
 */
export function DepositPreview({ bankAccountId, cashTotal, checkTotal = 0 }: Props) {
  const [preview, setPreview] = useState<DepositPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasCash = cashTotal > 0;
  const hasChecks = checkTotal > 0;

  useEffect(() => {
    if (!bankAccountId || (!hasCash && !hasChecks)) return;
    let cancelled = false;
    previewDepositSlip({ bankAccountId, cashTotal, checkTotal })
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "The journal preview could not be resolved.");
      });
    return () => {
      cancelled = true;
    };
  }, [bankAccountId, cashTotal, checkTotal, hasCash, hasChecks]);

  // A stale set of entries from the previous amounts is never shown: the guard is on render.
  const current = bankAccountId && (hasCash || hasChecks) ? preview : null;
  const entries = current?.entries ?? [];
  const unmapped = [...new Set(entries.flatMap((entry) => entry.missingMappingKeys))];

  return (
    <div className="rounded-xl border border-border/60">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-3 py-2">
        <p className="min-w-0 truncate text-xs font-semibold">
          {hasCash && hasChecks
            ? "E07 cash deposit + E12 check deposit"
            : hasCash
              ? "E07 cash deposit"
              : hasChecks
                ? "E12 check deposit"
                : "Posting preview"}
        </p>
        {current ? (
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[11px] font-semibold", toneClass(unmapped.length ? "warning" : "success"))}
          >
            {unmapped.length ? "GL mapping missing" : "Balanced"}
          </Badge>
        ) : null}
      </div>

      {current?.account.glFallback ? (
        <p className="border-b border-border/50 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
          {current.account.label} has no linked GL account — the deposit posts to the default cash-in-bank
          account.
        </p>
      ) : null}

      {error ? (
        <p className="p-3 text-xs text-destructive">{error}</p>
      ) : !current ? (
        <p className="p-3 text-xs text-muted-foreground">
          {!bankAccountId
            ? "Choose the deposit account to see the posting."
            : "Nothing on this slip posts yet."}
        </p>
      ) : entries.length ? (
        <div className="divide-y divide-border/50">
          {entries.map((entry) => (
            <EntryTable key={entry.eventCode} entry={entry} showHeader={entries.length > 1} />
          ))}
        </div>
      ) : null}

      {unmapped.length > 0 ? (
        <p className="border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
          Configure {unmapped.join(", ")} under bank GL mapping to post this deposit.
        </p>
      ) : null}
    </div>
  );
}

function EntryTable({ entry, showHeader }: { entry: ResolvedJournalEntry; showHeader: boolean }) {
  const balanced =
    entry.missingMappingKeys.length === 0 && Math.abs(entry.totalDebit - entry.totalCredit) < 0.005;
  return (
    <div>
      {showHeader ? (
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {entry.eventCode} · {entry.description}
        </p>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 text-[10px] font-semibold",
            toneClass(balanced ? "success" : "warning"),
          )}
        >
          {balanced ? "Balanced" : entry.missingMappingKeys.length ? "GL mapping missing" : "Not balanced"}
        </Badge>
      </div>
      ) : null}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[56px] px-2">GL</TableHead>
              <TableHead className="min-w-0 px-2">Account</TableHead>
              <TableHead className="w-[86px] px-2 text-right">Debit</TableHead>
              <TableHead className="w-[86px] px-2 text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.lines.map((line) => (
              <TableRow key={line.lineNo}>
                <TableCell className="px-2 font-mono text-[11px]">{line.glCode ?? "—"}</TableCell>
                <TableCell className="min-w-0 px-2">
                  <p className="truncate text-[13px]" title={line.accountTitle ?? undefined}>
                    {line.accountTitle ?? `Unmapped: ${line.memo ?? "GL key"}`}
                  </p>
                  {line.memo ? <p className="truncate text-[11px] text-muted-foreground">{line.memo}</p> : null}
                </TableCell>
                <TableCell className="px-2 text-right text-xs tabular-nums">
                  {line.debit ? formatCurrency(line.debit) : "—"}
                </TableCell>
                <TableCell className="px-2 text-right text-xs tabular-nums">
                  {line.credit ? formatCurrency(line.credit) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="px-2 text-xs font-semibold">
                Total
              </TableCell>
              <TableCell className="px-2 text-right text-xs font-semibold tabular-nums">
                {formatCurrency(entry.totalDebit)}
              </TableCell>
              <TableCell className="px-2 text-right text-xs font-semibold tabular-nums">
                {formatCurrency(entry.totalCredit)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
