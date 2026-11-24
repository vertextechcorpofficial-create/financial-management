"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MemberApiError, memberFetch, newRequestKey } from "../../members/client";
import { date, peso } from "../../members/format";
import { Kv } from "../components/ui";
import { dividendActionDetails, dividendJournalLabels, type DividendPostedRun, type DividendPostingPreview } from "./types";
import { useDividendRead } from "./useDividendRead";

export function DividendPostingDialog({ endpoint, disabled, disabledReason, onPosted, reloadYear }: {
  endpoint: string;
  disabled: boolean;
  disabledReason?: string;
  onPosted: (run: DividendPostedRun) => void;
  reloadYear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const key = useRef<{ fingerprint: string; requestKey: string }>(undefined);
  const result = useDividendRead<DividendPostingPreview>(open ? endpoint + "/posting-preview" : null);
  const preview = result.error || result.loading ? undefined : result.data;

  useEffect(() => { setConfirmed(false); }, [preview?.fingerprint]);

  function changeOpen(next: boolean) {
    if (working) return;
    setMessage("");
    setConfirmed(false);
    if (next) result.reload();
    setOpen(next);
  }

  async function confirm() {
    if (working || !preview?.journalPreview.length || !confirmed) return;
    if (key.current?.fingerprint !== preview.fingerprint) {
      key.current = { fingerprint: preview.fingerprint, requestKey: newRequestKey() };
    }
    setMessage("");
    setWorking(true);
    try {
      const { run } = await memberFetch<{ run: DividendPostedRun }>(endpoint + "/post", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...key.current, draftRevision: preview.draft.revision }),
      });
      onPosted(run);
      setOpen(false);
    } catch (error) {
      const detail = dividendActionDetails.safeParse(error instanceof MemberApiError ? error.payload?.details : null);
      if (detail.success && detail.data.run) {
        onPosted(detail.data.run);
        setOpen(false);
      } else {
        if (detail.success && detail.data.preview) result.replace(detail.data.preview);
        else if (error instanceof MemberApiError && error.payload?.code === "DIVIDEND_PREVIEW_CHANGED") result.reload();
        setMessage(error instanceof Error ? error.message : "Posting could not be confirmed. Retry the same request.");
      }
    } finally {
      setWorking(false);
    }
  }

  return <>
    <Button type="button" disabled={disabled} title={disabled ? disabledReason : undefined} onClick={() => changeOpen(true)}>
      <Send className="size-4" /> Review posting
    </Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent showCloseButton={!working} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Send className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle>Review annual dividend posting</DialogTitle>
              <DialogDescription>Verify the allocations and resulting savings balances before posting.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>Posting credits member savings and records the annual dividend journals. This action is final for the selected year.</p>
          </div>
          {result.loading && <DividendPostingSkeleton />}
          {result.error && <div role="alert" className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{result.error}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={result.reload}>Retry review</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { reloadYear(); changeOpen(false); }}>Reload year</Button>
            </div>
          </div>}
          {preview && <DividendPostingDetails preview={preview} />}
          {preview && preview.journalPreview.length > 0 && <label className="flex items-start gap-2 rounded-xl border bg-muted/20 p-3 text-sm">
            <input type="checkbox" className="mt-1 accent-primary" checked={confirmed} disabled={working}
              onChange={event => setConfirmed(event.target.checked)} />
            <span>I reviewed the allocation and journal entries and understand this posting is final.</span>
          </label>}
        </div>
        {message && <p role="alert" className="shrink-0 px-4 pb-3 text-sm text-destructive sm:px-6">{message}</p>}
        <DialogFooter className="shrink-0 border-t p-4 sm:px-6">
          <Button type="button" variant="outline" disabled={working} onClick={() => changeOpen(false)}>Cancel</Button>
          <Button type="button" disabled={working || !confirmed || !preview?.journalPreview.length} onClick={() => void confirm()}>
            {working ? "Posting…" : "Confirm posting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

export function DividendPostingDetails({ preview, journals }: { preview: DividendPostingPreview; journals?: DividendPostedRun["journals"] }) {
  const { allocation } = preview;
  const members = new Map(preview.basis.rows.map(row => [row.membershipId, row]));
  const credits = new Map(allocation.credits.map(row => [row.membershipId, row]));
  return <div className="space-y-4">
    <section className="rounded-xl border bg-muted/20 p-3">
      <h3 className="mb-2 text-sm font-semibold">Posting summary</h3>
      <Kv rows={[
        ["Dividend year", preview.draft.year], ["Draft revision", preview.draft.revision], ["Posting date (PHT)", date(preview.postingDate)],
        ["Reserve fund", peso(allocation.reserve)], ["Education & training fund", peso(allocation.education)],
        ["Interest on savings credits", peso(allocation.savings.allocated)], ["Patronage refunds", peso(allocation.patronage.allocated)],
        ["Undivided surplus", peso(allocation.undividedSurplus)],
      ]} />
    </section>
    {!preview.journalPreview.length && <p role="status" className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">There are no allocations or credits to post.</p>}
    {preview.recipients.length > 0 && <section className="space-y-2">
      <h3 className="text-sm font-semibold">Member savings credits</h3>
      <div className="overflow-x-auto rounded-xl border">
        <Table aria-label="Savings credits">
          <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead scope="col">Recipient</TableHead>
            <TableHead scope="col" className="text-right">Before</TableHead>
            <TableHead scope="col" className="text-right">Savings credit</TableHead>
            <TableHead scope="col" className="text-right">Patronage refund</TableHead>
            <TableHead scope="col" className="text-right">After posting</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {preview.recipients.map(recipient => {
              const credit = credits.get(recipient.membershipId);
              return <TableRow key={recipient.membershipId}>
                <TableCell>{members.get(recipient.membershipId)?.name ?? recipient.membershipId}</TableCell>
                {[recipient.before, credit?.savingsCredit, credit?.patronageRefund, recipient.after].map((amount, index) =>
                  <TableCell key={index} className="text-right font-mono tabular-nums">{peso(amount)}</TableCell>)}
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </div>
    </section>}
    {preview.journalPreview.length > 0 && <section className="space-y-2">
      <h3 className="text-sm font-semibold">{journals ? "Posted journals" : "Journal preview"}</h3>
      <div className="overflow-x-auto rounded-xl border">
        <Table aria-label={journals ? "Posted journals" : "Journal preview"}>
          <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead scope="col">{journals ? "Journal number" : "Journal"}</TableHead>
            <TableHead scope="col">Debit account</TableHead>
            <TableHead scope="col">Credit account</TableHead>
            <TableHead scope="col" className="text-right">Amount</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {preview.journalPreview.flatMap((journal, index) => journal.pairs.map((pair, line) => <TableRow key={`${index}:${line}`}>
              <TableCell>
                {journals?.[index] ? <span className="font-mono font-medium">{journals[index].number}</span> : dividendJournalLabels[journal.kind]}
                {journal.membershipId && <span className="block text-xs text-muted-foreground">{members.get(journal.membershipId)?.name}</span>}
              </TableCell>
              <TableCell>{pair.debit.code} · {pair.debit.name}</TableCell>
              <TableCell>{pair.credit.code} · {pair.credit.name}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{peso(pair.amount)}</TableCell>
            </TableRow>))}
          </TableBody>
        </Table>
      </div>
    </section>}
  </div>;
}

function DividendPostingSkeleton() {
  return <div className="space-y-3" aria-busy="true">
    <div className="h-48 animate-pulse rounded-xl border bg-muted/30" />
    <div className="h-40 animate-pulse rounded-xl border bg-muted/30" />
    <div className="h-40 animate-pulse rounded-xl border bg-muted/30" />
  </div>;
}
