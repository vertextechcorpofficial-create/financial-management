"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { useLifecycleCommand, useLifecycleRead } from "../../loans/lifecycle-client";
import type { bulkApproveRemittances, listApprovalAgencies, listRemittanceApproval, reviewRemittanceApproval } from "../../server/remittance-approval";
import { IncludedDeductions } from "../preparation/RemittancePreparationModule";
import { dayDifference, remittanceChannels, remittanceTotals } from "../preparation/rules";

const api = "/api/fm/government-loans/remittance-approval";
type Queue = Awaited<ReturnType<typeof listRemittanceApproval>>;
type Review = Awaited<ReturnType<typeof reviewRemittanceApproval>>;
type BulkResult = Awaited<ReturnType<typeof bulkApproveRemittances>>;
const formatMoney = (value: string | null) => value === null ? "Unavailable" : peso(value);
const checkLabel = { pass: "Passed", warning: "Warning", block: "Blocked", na: "Not applicable" };

function Pages({ page, more, onPage, label }: { page: number; more: boolean; onPage: (page: number) => void; label: string }) {
  if (page === 1 && !more) return null;
  return <nav aria-label={label} className="flex items-center gap-2">
    <Button size="sm" variant="outline" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</Button>
    <span className="text-sm">Page {page}</span>
    <Button size="sm" variant="outline" disabled={!more} onClick={() => onPage(page + 1)}>Next</Button>
  </nav>;
}

function ReviewDialog({ id, close, saved }: { id: string; close: () => void; saved: (message: string) => void }) {
  const url = api + "/" + id;
  const [revision, reload] = useState(0);
  const [reason, setReason] = useState("");
  const [acknowledgedToken, acknowledge] = useState("");
  const loaded = useLifecycleRead<Review>(url, revision);
  const command = useLifecycleCommand();
  const data = loaded?.data;
  const pending = data?.payment.state === "PENDING";
  const blocked = data?.evidence.checks.some(check => check.status === "block");
  const warnings = data?.evidence.checks.some(check => check.status === "warning");
  const acknowledged = acknowledgedToken === data?.token;
  const totals = data ? remittanceTotals([{ withheld: data.payment.withheld, penalty: data.payment.entered_penalty }]) : null;
  const details = data ? [
    ["Agency", data.evidence.agencyName], ["Employer account", data.evidence.employerNumber ?? "Unavailable"],
    ["Payroll month", data.payment.payroll_month], ["Payment period", data.payment.payment_date.slice(0, 7)],
    ["Deadline", date(data.payment.due_date)], ["Paid on", date(data.payment.payment_date)],
    ["Payment channel", remittanceChannels[data.batch.channel]], [data.evidence.referenceLabel, data.payment.payment_reference],
    ["Prepared by", data.batch.preparedBy + " · " + dateTime(data.batch.submittedAt) + " PHT"],
    ["Payroll receipt", "Filed revision " + data.payment.source_snapshot.receiptRevision +
      (data.evidence.latestReceipt ? " · Checked revision " + data.evidence.latestReceipt.revision : "")],
    ["Billing revision checked", data.evidence.billingRevision?.number ?? "Unavailable"],
  ] : [];

  function decide(action: "APPROVE" | "RETURN") {
    if (!data) return;
    void command.run(url, { action, token: data.token, acknowledgeWarnings: action === "APPROVE" && acknowledged,
      reason: action === "RETURN" ? reason.trim() : "" }, () => saved(action === "APPROVE" ? "Remittance approved." : "Remittance returned."));
  }

  return <Dialog open onOpenChange={open => { if (!open && !command.busy) close(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl" showCloseButton={false}>
      <DialogHeader className="shrink-0 border-b p-4">
        <DialogTitle>{data ? "Review " + data.payment.agency_name + " remittance" : "Review remittance"}</DialogTitle>
        <DialogDescription>{data ? data.payment.payroll_month + " Payroll · " + data.payment.payment_reference : "Payment evidence and approval checks"}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!data && <p role={loaded?.error ? "alert" : "status"}>{loaded?.error ?? "Loading remittance…"}</p>}
        {data && totals && <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([["Amount paid", totals.withheld], ["Entered penalty", totals.penalties],
              ["Total cash out", totals.cashOut], [data.decision ? "Withholding owed after decision" : "Remaining withholding owed", data.liability.remaining]] as const)
              .map(([label, value]) => <div key={label} className="rounded-md border p-2 text-sm">
                <dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{formatMoney(value)}</dd></div>)}
          </dl>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="space-y-2 rounded-md border p-3">
              <h3 className="font-semibold">Payment details</h3>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 break-words text-sm">
                {details.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}
              </dl>
              <p className="break-all text-sm">{data.batch.proofName}</p>
              <div className="flex flex-wrap gap-3 text-sm">
                <a className="underline" href={url + "?proof=1&inline=1"} target="_blank" rel="noreferrer">Preview proof</a>
                <a className="underline" href={url + "?proof=1"}>Download proof</a>
              </div>
            </section>
            <section className="rounded-md border p-3">
              <h3 className="font-semibold">Approval checks</h3>
              <ul className="divide-y text-sm">
                {data.evidence.checks.map(check => <li key={check.label} className="space-y-1 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-1"><span>{check.label}</span>
                    <Badge variant={check.status === "block" ? "destructive" : check.status === "warning" ? "secondary" : "outline"}>{checkLabel[check.status]}</Badge></div>
                  <div className="text-muted-foreground">{check.detail}</div>
                </li>)}
              </ul>
              {data.evidence.billingAmounts && <p className="mt-2 text-sm text-muted-foreground">
                Billed {formatMoney(data.evidence.billingAmounts.billed)} · Deducted {formatMoney(data.evidence.billingAmounts.deduction)}
                {" · Difference " + formatMoney(data.evidence.billingAmounts.difference)}</p>}
            </section>
          </div>
          <IncludedDeductions url={url + "?deductions=1"} initiallyExpanded />
          {pending && <div className="space-y-2">
            {warnings && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={acknowledged}
              onChange={event => acknowledge(event.target.checked ? data.token : "")} /> I reviewed the warnings.</label>}
            <label className="block text-sm">Reason required to return
              <Textarea value={reason} maxLength={500} disabled={command.busy} onChange={event => setReason(event.target.value)} /></label>
          </div>}
          {data.decision && <p className="rounded-md border p-3 text-sm">
            {data.decision.action === "APPROVE" ? "Approved" : "Returned"} by {data.decision.actor} · {dateTime(data.decision.at)} PHT
            {data.decision.reason && <span className="block break-words">{data.decision.reason}</span>}</p>}
        </>}
        {command.error && <p role="alert" className="text-sm text-destructive">{command.error}</p>}
      </div>
      <DialogFooter className="shrink-0 border-t p-4">
        <Button variant="outline" disabled={command.busy} onClick={close}>Close</Button>
        {(loaded?.error || command.error) && <Button variant="outline" disabled={command.busy} onClick={() => reload(value => value + 1)}>Refresh review</Button>}
        {pending && <>
          <Button variant="outline" disabled={command.busy || !reason.trim()} onClick={() => decide("RETURN")}>Return to preparer</Button>
          <Button disabled={command.busy || blocked || (warnings && !acknowledged)} onClick={() => decide("APPROVE")}>Approve &amp; post</Button>
        </>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function RemittanceApprovalModule() {
  const [q, setSearch] = useState("");
  const [agency, setAgency] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [revision, reload] = useState(0);
  const [reviewId, review] = useState<string>();
  const [selected, select] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [skips, setSkips] = useState<{ id: string; reference: string; reason: string | null }[]>([]);
  const [bulkOpen, openBulk] = useState(false);
  const command = useLifecycleCommand();
  const agencies = useLifecycleRead<Awaited<ReturnType<typeof listApprovalAgencies>>>(api + "?agencies=1");
  const params = new URLSearchParams({ q, page: String(page), historyPage: String(historyPage) });
  if (agency) params.set("agencyId", agency);
  if (overdue) params.set("overdue", "1");
  const loaded = useLifecycleRead<Queue>(api + "?" + params, revision);
  const pending = loaded?.data?.pending ?? [];
  const selection = pending.filter(row => selected.includes(row.id));
  const all = pending.length > 0 && selection.length === pending.length;

  function refresh() {
    reload(value => value + 1);
    select([]);
  }
  function confirmBulk() {
    void command.run(api + "/bulk", { ids: selection.map(row => row.id) }, async response => {
      const result: BulkResult = await response.json();
      const approved = result.items.filter(row => row.approved).length;
      setSkips(result.items.filter(row => !row.approved).map(row => ({
        ...row, reference: selection.find(item => item.id === row.id)?.reference ?? row.id,
      })));
      setNotice(approved + " approved · " + (result.items.length - approved) + " skipped");
      openBulk(false);
      setPage(1);
      setHistoryPage(1);
      refresh();
    });
  }

  return <div className="space-y-5">
    <section aria-labelledby="remittance-queue" className="space-y-3">
      <h2 id="remittance-queue" className="font-semibold">Waiting for approval</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Reference, preparer, or agency<Input maxLength={120} value={q} onChange={event => {
          setSearch(event.target.value); setPage(1); select([]);
        }} /></label>
        <div className="grid gap-1 text-sm"><label htmlFor="remittance-approval-agency">Agency</label>
          <NativeSelect id="remittance-approval-agency" value={agency} disabled={!agencies?.data} onChange={event => {
          setAgency(event.target.value); setPage(1); select([]);
        }}>
          <option value="">{agencies?.error ? "Agency list unavailable" : "All agencies"}</option>
          {agencies?.data?.map(option => <option key={option.id} value={option.id}>{option.display_name}</option>)}
          </NativeSelect>
        </div>
        <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={overdue} onChange={event => {
          setOverdue(event.target.checked); setPage(1); select([]);
        }} /> Waiting more than 3 days</label>
        <Button variant="outline" onClick={refresh}>Refresh</Button>
      </div>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {!!skips.length && <ul className="list-inside list-disc break-words text-sm">
        {skips.map(row => <li key={row.id}>{row.reference} · {row.reason}</li>)}</ul>}
      {!loaded?.data && <p role={loaded?.error ? "alert" : "status"} className="text-sm">{loaded?.error ?? "Loading remittances…"}</p>}
      {loaded?.data && <>
        <Button disabled={!selection.length} onClick={() => openBulk(true)}>Bulk approve{selection.length ? " (" + selection.length + ")" : ""}</Button>
        <div className="rounded-md border"><Table>
          <TableHeader><TableRow>
            <TableHead><input type="checkbox" aria-label="Select all on this page" checked={all} disabled={!pending.length}
              onChange={event => select(event.target.checked ? pending.map(row => row.id) : [])} /></TableHead>
            {["Agency", "Payroll month", "Amount paid", "Penalty", "Paid on", "Reference", "Prepared by", "Waiting", "Actions"]
              .map(label => <TableHead key={label}>{label}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>{pending.map(row => <TableRow key={row.id}>
            <TableCell><input type="checkbox" aria-label={"Select " + row.reference} checked={selected.includes(row.id)} onChange={event =>
              select(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} /></TableCell>
            <TableCell>{row.agency}</TableCell><TableCell>{row.month}</TableCell><TableCell>{peso(row.amount)}</TableCell>
            <TableCell>{peso(row.penalty)}</TableCell><TableCell>{date(row.paymentDate)}</TableCell>
            <TableCell>{row.reference}</TableCell><TableCell>{row.preparedBy}<span className="block text-muted-foreground">{dateTime(row.submittedAt)} PHT</span></TableCell>
            <TableCell>{Math.max(0, dayDifference(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric",
              month: "2-digit", day: "2-digit" }).format(new Date(row.submittedAt)), loaded.data!.today))} day(s)</TableCell>
            <TableCell><Button size="sm" variant="outline" onClick={() => review(row.id)}>Review</Button></TableCell>
          </TableRow>)}
            {!pending.length && <TableRow><TableCell colSpan={10}>No remittances waiting for approval.</TableCell></TableRow>}
          </TableBody></Table></div>
        <Pages page={page} more={loaded.data.hasMore} label="Pending pages" onPage={next => { setPage(next); select([]); }} />
      </>}
    </section>
    {loaded?.data && <section aria-labelledby="remittance-history" className="space-y-3">
      <h2 id="remittance-history" className="font-semibold">Recent decisions</h2>
      <div className="rounded-md border"><Table>
        <TableHeader><TableRow>{["Agency", "Payroll month", "Amount", "Reference", "Decision", "Decided by", "Actions"]
          .map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{loaded.data.history.map(row => <TableRow key={row.decisionId}>
          <TableCell>{row.agency}</TableCell><TableCell>{row.month}</TableCell><TableCell>{peso(row.amount)}</TableCell>
          <TableCell>{row.reference}</TableCell><TableCell>{row.action === "APPROVE" ? "Approved" : "Returned"}
            {row.reason && <div className="max-w-xs break-words text-muted-foreground">{row.reason}</div>}</TableCell>
          <TableCell>{row.actor}<span className="block text-muted-foreground">{dateTime(row.at)} PHT</span></TableCell>
          <TableCell><Button size="sm" variant="outline" onClick={() => review(row.id)}>View decision</Button></TableCell>
        </TableRow>)}
          {!loaded.data.history.length && <TableRow><TableCell colSpan={7}>No decisions yet.</TableCell></TableRow>}
        </TableBody></Table></div>
      <Pages page={historyPage} more={loaded.data.hasMoreHistory} label="Decision pages" onPage={setHistoryPage} />
    </section>}
    {reviewId && <ReviewDialog key={reviewId} id={reviewId} close={() => review(undefined)} saved={message => {
      review(undefined); setNotice(message); setSkips([]); setPage(1); setHistoryPage(1); refresh();
    }} />}
    <Dialog open={bulkOpen} onOpenChange={open => { if (!command.busy) openBulk(open); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Bulk approve {selection.length} remittance(s)</DialogTitle>
          <DialogDescription>Each remittance will be checked again. Any row with warnings or blockers will be skipped.</DialogDescription></DialogHeader>
        {command.error && <p role="alert" className="text-sm text-destructive">{command.error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={command.busy} onClick={() => openBulk(false)}>Cancel</Button>
          <Button disabled={command.busy || !selection.length} onClick={confirmBulk}>Approve &amp; post</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
