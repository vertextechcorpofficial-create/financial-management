"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getLedgerJournal, SetupError } from "../providers/bankReconciliationSetupApi";
import type { LedgerJournalDetails, ReconciliationPeriod } from "../setup-types";
import type { TransactionLine } from "../transaction-types";
import { transactionMoney } from "../utils/transactionDisplay";

type Props = { period: ReconciliationPeriod; line: TransactionLine };
type Read = { state: "loading" } | { state: "ready"; details: LedgerJournalDetails } | { state: "error"; message: string; retry: boolean };

function JournalDetails({ period, line }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<Read>({ state: "loading" });
  const periodId = period.id, lineId = line.id, closureId = period.lifecycle?.closureId;
  useEffect(() => {
    const controller = new AbortController();
    getLedgerJournal(periodId, lineId, closureId, controller.signal).then(details => {
      if (!controller.signal.aborted) setRead({ state: "ready", details });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setRead({ state: "error", message: error instanceof Error ? error.message : "Unable to load the source journal.",
        retry: !(error instanceof SetupError && [401, 403, 404].includes(error.status)) });
    });
    return () => controller.abort();
  }, [periodId, lineId, closureId, attempt]);

  if (read.state === "loading") return <p role="status" className="text-sm text-muted-foreground">Loading source journal…</p>;
  if (read.state === "error") return <div className="space-y-2 text-sm">
    <p role="alert" className="text-destructive">{read.message}</p>
    {read.retry && <Button type="button" variant="outline" size="sm" onClick={() => { setRead({ state: "loading" }); setAttempt(attempt + 1); }}>Retry source journal</Button>}
  </div>;

  const { details } = read;
  return <div className="min-w-0 space-y-3 text-sm">
    <p className="break-words">{details.journal.journalNumber || `Journal #${details.journal.journalId}`} · {details.date}{details.reference && ` · ${details.reference}`}</p>
    <div className="max-h-[50dvh] overflow-auto rounded-md border">
      <table className="w-full text-left">
        <thead className="bg-muted"><tr><th scope="col" className="p-2">Account</th><th scope="col" className="p-2">Description</th><th scope="col" className="p-2 text-right">Debit</th><th scope="col" className="p-2 text-right">Credit</th></tr></thead>
        <tbody>{details.lines.map(row => <tr key={`${row.lineId}:${row.leg}`} className={`border-t align-top ${row.selected ? "bg-primary/5" : ""}`}>
          <td className="p-2">{[row.accountCode, row.accountName].filter(Boolean).join(" · ") || "—"}{row.selected && <p className="text-xs font-medium text-primary">Books line</p>}</td>
          <td className="min-w-28 break-words p-2">{row.description || "—"}</td>
          <td className="whitespace-nowrap p-2 text-right tabular-nums">{transactionMoney(row.debit, period.currency)}</td>
          <td className="whitespace-nowrap p-2 text-right tabular-nums">{transactionMoney(row.credit, period.currency)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

export function LedgerJournalDialog({ period, line }: Props) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline" aria-label={`View GL source for ${line.reference || `line ${line.id}`}`}>View GL source</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Source GL journal</DialogTitle>
        <DialogDescription>Posted journal for Books line {line.reference || `#${line.id}`}.</DialogDescription>
      </DialogHeader>
      {open && <JournalDetails period={period} line={line} />}
    </DialogContent>
  </Dialog>;
}
