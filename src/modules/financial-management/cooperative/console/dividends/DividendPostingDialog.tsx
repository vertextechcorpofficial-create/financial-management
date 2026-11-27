"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MemberApiError, memberFetch, newRequestKey } from "../../members/client";
import { date, peso } from "../../members/format";
import { Kv } from "../components/ui";
import { dividendActionDetails, dividendJournalLabels, type DividendPostedRun, type DividendPostingPreview } from "./types";
import { useDividendRead } from "./useDividendRead";

export function DividendPostingDialog({ endpoint, disabled, onPosted, reloadYear }: {
  endpoint: string;
  disabled: boolean;
  onPosted: (run: DividendPostedRun) => void;
  reloadYear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const key = useRef<{ fingerprint: string; requestKey: string }>(undefined);
  const result = useDividendRead<DividendPostingPreview>(open ? endpoint + "/posting-preview" : null);
  const preview = result.error || result.loading ? undefined : result.data;

  function changeOpen(next: boolean) {
    if (working) return;
    setMessage("");
    if (next) result.reload();
    setOpen(next);
  }

  async function confirm() {
    if (working || !preview?.journalPreview.length) return;
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
    <Button type="button" size="sm" disabled={disabled} onClick={() => changeOpen(true)}>Post to member savings</Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent showCloseButton={!working} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b p-4 sm:p-6">
          <DialogTitle>Review annual dividend posting</DialogTitle>
          <DialogDescription>Verify the allocations and resulting savings balances before posting.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
          {result.loading && <p role="status" className="text-sm">Loading the posting review…</p>}
          {result.error && <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>{result.error}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={result.reload}>Retry review</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { reloadYear(); changeOpen(false); }}>Reload year</Button>
            </div>
          </div>}
          {preview && <DividendPostingDetails preview={preview} />}
        </div>
        {message && <p role="alert" className="shrink-0 px-4 pb-3 text-sm text-destructive sm:px-6">{message}</p>}
        <DialogFooter className="shrink-0 border-t p-4 sm:px-6">
          <Button type="button" variant="outline" disabled={working} onClick={() => changeOpen(false)}>Cancel</Button>
          <Button type="button" disabled={working || !preview?.journalPreview.length} onClick={() => void confirm()}>
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
    <Kv rows={[
      ["Dividend year", preview.draft.year], ["Draft revision", preview.draft.revision], ["Posting date (PHT)", date(preview.postingDate)],
      ["Reserve fund", peso(allocation.reserve)], ["Education & training fund", peso(allocation.education)],
      ["Interest on savings credits", peso(allocation.savings.allocated)], ["Patronage refunds", peso(allocation.patronage.allocated)],
      ["Undivided surplus", peso(allocation.undividedSurplus)],
    ]} />
    {!preview.journalPreview.length && <p role="status" className="text-sm text-muted-foreground">There are no allocations or credits to post.</p>}
    {preview.recipients.length > 0 && <div className="rounded-md border">
      <Table aria-label="Savings credits">
        <TableHeader><TableRow>
          <TableHead>Recipient</TableHead><TableHead className="text-right">Before</TableHead>
          <TableHead className="text-right">Savings credit</TableHead><TableHead className="text-right">Patronage refund</TableHead>
          <TableHead className="text-right">After posting</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {preview.recipients.map(recipient => {
            const credit = credits.get(recipient.membershipId);
            return <TableRow key={recipient.membershipId}>
              <TableCell>{members.get(recipient.membershipId)?.name ?? recipient.membershipId}</TableCell>
              {[recipient.before, credit?.savingsCredit, credit?.patronageRefund, recipient.after].map((amount, index) =>
                <TableCell key={index} className="text-right tabular-nums">{peso(amount)}</TableCell>)}
            </TableRow>;
          })}
        </TableBody>
      </Table>
    </div>}
    {preview.journalPreview.length > 0 && <div className="rounded-md border">
      <Table aria-label={journals ? "Posted journals" : "Journal preview"}>
        <TableHeader><TableRow>
          <TableHead>{journals ? "Journal number" : "Journal"}</TableHead><TableHead>Debit account</TableHead>
          <TableHead>Credit account</TableHead><TableHead className="text-right">Amount</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {preview.journalPreview.flatMap((journal, index) => journal.pairs.map((pair, line) => <TableRow key={`${index}:${line}`}>
            <TableCell>
              {journals?.[index] ? <span className="font-mono font-medium">{journals[index].number}</span> : dividendJournalLabels[journal.kind]}
              {journal.membershipId && <span className="block text-xs text-muted-foreground">{members.get(journal.membershipId)?.name}</span>}
            </TableCell>
            <TableCell>{pair.debit.code} · {pair.debit.name}</TableCell>
            <TableCell>{pair.credit.code} · {pair.credit.name}</TableCell>
            <TableCell className="text-right tabular-nums">{peso(pair.amount)}</TableCell>
          </TableRow>))}
        </TableBody>
      </Table>
    </div>}
  </div>;
}
