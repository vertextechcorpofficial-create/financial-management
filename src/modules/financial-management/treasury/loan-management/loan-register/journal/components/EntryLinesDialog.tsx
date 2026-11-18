"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatNumber } from "@/lib/utils";

import { ENTRY_TYPE_LABEL } from "../constants";
import { money, shortDate } from "../money";
import type { EntryRow } from "../types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  entry: EntryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The entry as posted: its header figures, then the lines that make them up. */
export function EntryLinesDialog({ entry, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[95vw] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[760px]"
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="line-clamp-1 tabular-nums">{entry?.entryNo ?? "Journal entry"}</DialogTitle>
          <DialogDescription className="line-clamp-2 max-w-md">
            {entry
              ? `${shortDate(entry.entryDate)} · ${ENTRY_TYPE_LABEL[entry.entryType]} · ${entry.loanNo ?? "No loan"} ${
                  entry.lenderName ? `· ${entry.lenderName}` : ""
                }`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {entry ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {entry.description ? <p className="text-sm break-words">{entry.description}</p> : null}

            {entry.difference == null ? null : (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Does not balance: {entry.differenceNote ?? "the figures disagree"} by{" "}
                  <span className="font-medium tabular-nums">{money(Math.abs(entry.difference))}</span>. Header says{" "}
                  <span className="tabular-nums">{money(entry.totalDebit)}</span> debit against{" "}
                  <span className="tabular-nums">{money(entry.totalCredit)}</span> credit; the lines add up to{" "}
                  <span className="tabular-nums">{money(entry.lineDebit)}</span> and{" "}
                  <span className="tabular-nums">{money(entry.lineCredit)}</span>.
                </span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Account</th>
                    <th className="px-3 py-2 text-left font-medium">Memo</th>
                    <th className="px-3 py-2 text-right font-medium">Debit</th>
                    <th className="px-3 py-2 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entry.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{line.lineNo}</td>
                      <td className="px-3 py-2">
                        <div className="max-w-[220px] truncate" title={`${line.code} · ${line.title}`}>
                          {line.code} · {line.title}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="max-w-[200px] truncate text-muted-foreground" title={line.memo || undefined}>
                          {line.memo || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{line.debit === 0 ? "—" : money(line.debit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{line.credit === 0 ? "—" : money(line.credit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border bg-muted/20 text-sm font-medium">
                  <tr>
                    <td className="px-3 py-2" colSpan={3}>
                      {formatNumber(entry.lineCount)} {entry.lineCount === 1 ? "line" : "lines"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(entry.lineDebit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(entry.lineCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge tone="neutral">{entry.periodKey || "No period"}</StatusBadge>
              {entry.reversesEntryNo ? <span>Reverses {entry.reversesEntryNo}</span> : null}
              {entry.reversedByNo ? <span>Reversed by {entry.reversedByNo}</span> : null}
            </div>
          </div>
        ) : null}

        <div className="flex justify-end border-t border-border bg-muted/20 px-6 py-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
