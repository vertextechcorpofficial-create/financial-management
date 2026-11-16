"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";

import { toneClass } from "../constants";
import { previewDepositSlip, type DepositPreview as DepositPreviewResponse } from "../providers/depositApi";

interface Props {
  bankAccountId: number | null;
  cashTotal: number;
  /** Checks on the same slip. They post nothing now, so the heading must not claim a cash entry. */
  checkCount?: number;
}

/**
 * Live E07 preview. The server resolves the same lines the posting path will use, so this panel
 * reports unmapped GL keys instead of inventing accounts.
 */
export function DepositPreview({ bankAccountId, cashTotal, checkCount = 0 }: Props) {
  const [preview, setPreview] = useState<DepositPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bankAccountId || cashTotal <= 0) return;
    let cancelled = false;
    previewDepositSlip({ bankAccountId, cashTotal })
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
  }, [bankAccountId, cashTotal]);

  // A stale entry from the previous account is never shown: the guard is on render, not in the effect.
  const current = bankAccountId && cashTotal > 0 ? preview : null;
  const entry = current?.entry ?? null;
  const unmapped = entry?.missingMappingKeys ?? [];
  const balanced =
    entry !== null &&
    unmapped.length === 0 &&
    Math.abs(entry.totalDebit - entry.totalCredit) < 0.005;

  const hasCash = cashTotal > 0;
  const heading = hasCash
    ? checkCount > 0
      ? "E07 · Cash deposit + checks — preview"
      : "E07 · Cash deposit — preview"
    : checkCount > 0
      ? "Checks only — nothing posts now"
      : "Posting preview";

  return (
    <div className="rounded-xl border border-border/60">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-3 py-2">
        <p className="min-w-0 truncate text-xs font-semibold">{heading}</p>
        {current ? (
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[11px] font-semibold", toneClass(balanced ? "success" : "warning"))}
          >
            {balanced ? "Balanced" : unmapped.length ? "GL mapping missing" : "Not balanced"}
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
            : cashTotal <= 0
              ? "No cash on this slip, so nothing posts now. Each check debits the bank GL when it clears."
              : null}
        </p>
      ) : current && entry ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">GL</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="w-[110px] text-right">Debit</TableHead>
              <TableHead className="w-[110px] text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.lines.map((line) => (
              <TableRow key={line.lineNo}>
                <TableCell className="font-mono text-xs">{line.glCode ?? "—"}</TableCell>
                <TableCell className="max-w-[220px]">
                  <p className="truncate text-sm" title={line.accountTitle ?? undefined}>
                    {line.accountTitle ?? `Unmapped: ${line.memo ?? "GL key"}`}
                  </p>
                  {line.memo ? <p className="truncate text-[11px] text-muted-foreground">{line.memo}</p> : null}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {line.debit ? formatCurrency(line.debit) : "—"}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {line.credit ? formatCurrency(line.credit) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="text-xs font-semibold">
                Total
              </TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">
                {formatCurrency(entry.totalDebit)}
              </TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">
                {formatCurrency(entry.totalCredit)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      ) : null}

      {unmapped.length > 0 ? (
        <p className="border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
          Configure {unmapped.join(", ")} under bank GL mapping to post this deposit.
        </p>
      ) : null}
    </div>
  );
}
