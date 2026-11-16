"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFundRead, useFundDecision } from "../hooks/useFunds";
import { usePettyCashRefresh } from "../hooks/usePettyCashRefresh";
import { ErrorBox, Paging } from "./OnboardingCommon";
import { ResponsiveListSkeleton, FormSkeleton } from "./PettyCashSkeletons";
import { MasterTable } from "./MasterCommon";
import { approvalTimestamp } from "./VoucherDecisionDetails";
import { voucherMoney } from "../utils/voucherMoney";
import type { CashCount, CountApproval } from "../master-types";
import { cashCountStatus as countStatus } from "../master-types";
import type { Page } from "../onboarding-types";

export function CashCountApprovalQueue() {
  const [queue, setQueue] = useState("pending"), [search, setSearch] = useState(""), [page, setPage] = useState(1), [selected, setSelected] = useState<number | null>(null);
  const read = useFundRead<Page<CashCount>>(`replenishment-approval/counts?${new URLSearchParams({ queue, search, page: String(page), pageSize: "25" })}`, 250);
  usePettyCashRefresh(read.refresh, read.loading || read.refreshing);
  const last = read.data ? Math.max(1, Math.ceil(read.data.total / 25)) : page;
  if (page > last) setPage(last);
  return <section aria-label="Cash Count approvals" className="space-y-4 rounded-xl border bg-card p-4 md:p-5"><div><h2 className="text-lg font-semibold">Cash Counts</h2><p className="mt-1 text-sm text-muted-foreground">The named approver verifies the physical count and classification. Approval updates available cash; the variance reaches the GL at replenishment or closure.</p></div>
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1 space-y-2"><label htmlFor="count-approval-search" className="text-sm font-medium">Search cash counts</label><Input id="count-approval-search" maxLength={200} placeholder="Count number, fund number or fund name" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div><div className="space-y-2"><label htmlFor="count-approval-queue" className="text-sm font-medium">Count queue</label><select id="count-approval-queue" className="block h-9 rounded-md border bg-background px-3 text-sm" value={queue} onChange={event => { setQueue(event.target.value); setPage(1); }}><option value="pending">Pending approval</option><option value="history">Decision history</option></select></div></div>
    <ErrorBox error={read.error || null} retry={read.refresh} title="Could not load cash counts" />{read.loading && <ResponsiveListSkeleton label="Loading cash count approvals" rows={3} columns={7} />}
    {read.data && <>{read.data.items.length ? <MasterTable label="Cash Count approvals" headers={["Count / recorded", "Fund / custodian", "Counted by / witness", "Expected cash", "Physical cash", "Over / (short)", "Approval / posting", ""]}>{read.data.items.map(count => <tr key={count.id}><td className="whitespace-nowrap">{count.docNo}<small className="block text-muted-foreground">{approvalTimestamp(count.recordedAt)}</small></td><td>{count.snapshot.fund.docNo} - {count.snapshot.fund.name}<small className="block text-muted-foreground">{count.snapshot.fund.custodian}</small></td><td>{count.snapshot.counter}<small className="block text-muted-foreground">Witness: {count.snapshot.witness}</small></td><td className="whitespace-nowrap">{voucherMoney(count.snapshot.fund.expectedCash)}</td><td className="whitespace-nowrap">{voucherMoney(count.snapshot.countedCash)}</td><td className="whitespace-nowrap">{voucherMoney(count.snapshot.variance)}</td><td>{countStatus(count)}<small className="block text-muted-foreground">{count.review?.approver}{count.resolution ? ` - ${count.resolution}` : ""}</small></td><td><Button variant="outline" size="sm" onClick={() => setSelected(count.id)}>{queue === "pending" ? "Review count" : "View count"}</Button></td></tr>)}</MasterTable> : <p className="text-sm text-muted-foreground">No cash counts match this queue.</p>}<Paging page={page} pageSize={25} total={read.data.total} onChange={setPage} /></>}
    {selected !== null && <CountReview id={selected} onClose={() => setSelected(null)} onChanged={result => { setSelected(null); read.refresh(); toast.success(`${result.count.docNo} ${result.count.review?.state === "APPROVED" ? "approved. Available cash updated; GL posting follows at replenishment or closure." : "rejected. Available cash is unchanged."}`); }} />}
  </section>;
}

function CountReview({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: (result: CountApproval) => void }) {
  const [classification, setClassification] = useState("CUSTODIAN"), [reason, setReason] = useState("");
  const read = useFundRead<CountApproval>(`replenishment-approval/counts/${id}?${new URLSearchParams({ classification })}`), command = useFundDecision<CountApproval>();
  const p = read.data, pending = p?.count.review?.state === "PENDING", locked = command.busy || command.uncertain;
  async function decide(action: "approve" | "reject") {
    if (!p || !p.count.review) return;
    const result = await command.run(`replenishment-approval/counts/${id}/${action}`, { version: p.count.review.version, reviewToken: p.reviewToken, classification, reason });
    if (result) onChanged(result);
  }
  return <Dialog open onOpenChange={open => { if (!open && !locked) onClose(); }}><DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{p?.count.docNo || "Review cash count"}</DialogTitle><DialogDescription>Verify denominations, custodian and variance before changing available cash. This decision does not post a journal.</DialogDescription></DialogHeader>
    {read.loading && <FormSkeleton label="Loading cash count review" fields={5} />}<ErrorBox error={read.error || null} retry={read.refresh} title="Could not load count review" /><ErrorBox error={command.error} retry={command.uncertain ? undefined : read.refresh} title="Could not decide cash count" />
    {p && <><dl className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Fund / custodian</dt><dd>{p.count.snapshot.fund.docNo} - {p.count.snapshot.fund.name}<br />{p.count.snapshot.fund.custodian}</dd></div><div><dt className="text-muted-foreground">Counted by / witness</dt><dd>{p.count.snapshot.counter} / {p.count.snapshot.witness}<br />{approvalTimestamp(p.count.recordedAt)}</dd></div><div><dt className="text-muted-foreground">Cash before approval</dt><dd>{voucherMoney(p.cashBefore)}</dd></div><div><dt className="text-muted-foreground">Physical cash / cash after approval</dt><dd>{voucherMoney(p.cashAfter)}</dd></div><div><dt className="text-muted-foreground">Over / (short)</dt><dd>{voucherMoney(p.count.snapshot.variance)}</dd></div><div><dt className="text-muted-foreground">Status</dt><dd>{countStatus(p.count)}{p.count.resolution ? ` - ${p.count.resolution}` : ""}</dd></div></dl>
      <MasterTable label="Counted denominations" headers={["Denomination", "Quantity", "Amount"]}>{p.count.snapshot.lines.filter(line => line.quantity > 0).map(line => <tr key={line.denominationId}><td>{line.kind} {voucherMoney(line.amount)}</td><td>{line.quantity}</td><td>{voucherMoney(line.total)}</td></tr>)}</MasterTable>
      {p.count.snapshot.remarks && <p className="whitespace-pre-wrap text-sm">Count remarks: {p.count.snapshot.remarks}</p>}
      {p.count.snapshot.variance !== "0.00" && <div className="space-y-2"><label htmlFor="count-classification" className="text-sm font-medium">Variance classification</label><select id="count-classification" className="block h-9 w-full rounded-md border bg-background px-3 text-sm" value={pending ? classification : p.classification} disabled={!pending || !p.canReject || locked} onChange={event => { setClassification(event.target.value); command.clearError(); }}><option value="CUSTODIAN">Custodian receivable / payable</option><option value="CASH_OVER_SHORT">Cash Over/Short</option></select><p className="text-sm">{p.account ? `${p.account.code} - ${p.account.name}` : "Configure the required posting account in Onboarding."}</p></div>}
      {p.blockers.length > 0 && <div role="alert" className="rounded-lg border border-amber-300 p-3 text-sm"><ul className="list-inside list-disc">{p.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></div>}
      {pending ? <div className="space-y-2"><label htmlFor="count-decision-reason" className="text-sm font-medium">Reason / investigation notes</label><Input id="count-decision-reason" value={reason} maxLength={1000} disabled={locked || !p.canReject} onChange={event => { setReason(event.target.value); command.clearError(); }} /><p className="text-xs text-muted-foreground">Required for rejection or Cash Over/Short classification.</p></div> : <p className="text-sm">{p.count.review?.decidedBy} - {approvalTimestamp(p.count.review?.decidedAt || "")}{p.count.review?.reason ? ` - ${p.count.review.reason}` : ""}</p>}
    </>}
    <div className="flex flex-wrap gap-2">{command.uncertain ? <Button disabled={command.busy} onClick={async () => { const result = await command.retry(); if (result) onChanged(result); }}>Check / retry decision</Button> : pending && <><Button disabled={locked || read.refreshing || !p?.canApprove || classification === "CASH_OVER_SHORT" && !reason.trim()} onClick={() => void decide("approve")}>Approve count</Button><Button variant="destructive" disabled={locked || !p?.canReject || !reason.trim()} onClick={() => void decide("reject")}>Reject count</Button></>}{p && <Button asChild variant="outline"><a target="_blank" rel="noreferrer" href={`/api/fm/petty-cash/replenishment-approval/counts/${id}/print`}>Print count</a></Button>}<Button variant="outline" disabled={locked} onClick={onClose}>Close</Button></div>
  </DialogContent></Dialog>;
}
