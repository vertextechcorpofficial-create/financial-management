"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorBox, OnboardingFeedback } from "./OnboardingCommon";
import { DecisionConfirm } from "./DecisionConfirm";
import { ReviewActions } from "./ReviewActions";
import { ReviewSkeleton } from "./PettyCashSkeletons";
import { ReplenishmentJournal } from "./ReplenishmentJournal";
import { ReplenishmentStatus } from "./ReplenishmentStatus";
import { useFundDecision, useFundRead } from "../hooks/useFunds";
import { onboardingFieldError } from "../utils/onboardingFeedback";
import { voucherCents, voucherMoney } from "../utils/voucherMoney";
import type { ReplenishmentReview } from "../replenishment-types";
import { dateTime, dateOnly } from "../utils/dateTime";

export const APPROVAL_API = "/api/fm/petty-cash/replenishment-approval";
const table = "w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:p-2 [&_th]:font-medium [&_td]:p-2";
const sum = (values: string[]) => { const cents = values.reduce((n, v) => n + voucherCents(v), 0n); return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`; };

export function ReplenishmentApprovalReview({ id, actorName, onClose, onChanged }: { id: number; actorName: string; onClose: () => void; onChanged: (record: ReplenishmentReview) => void }) {
  const read = useFundRead<ReplenishmentReview>(`replenishment-approval/requests/${id}`), command = useFundDecision<ReplenishmentReview>();
  const [remarks, setRemarks] = useState(""), [confirmed, setConfirmed] = useState(false), [confirming, setConfirming] = useState(false);
  const data = read.data, r = data?.row.request, p = r?.snapshot, locked = command.busy || command.uncertain, pending = r?.state === "PENDING";
  const remarksError = onboardingFieldError(command.error, "remarks") || onboardingFieldError(command.error, "reason");
  const cashError = onboardingFieldError(command.error, "cashConfirmed");
  function reload() { setConfirmed(false); setConfirming(false); command.clearError(); read.refresh(); }
  async function decide(action: "approve" | "reject") {
    if (!r || !data) return;
    const payload = action === "approve" ? { version: r.version, reviewToken: data.reviewToken, cashConfirmed: confirmed, remarks } : { version: r.version, reason: remarks };
    const result = await command.run(`replenishment-approval/requests/${id}/${action}`, payload); if (result) onChanged(result);
  }
  const print = <Button variant="outline" asChild><a target="_blank" rel="noreferrer" href={`${APPROVAL_API}/requests/${id}/print`}>Print</a></Button>;

  return <Dialog open onOpenChange={open => { if (!open && !locked) onClose(); }}><DialogContent showCloseButton={!locked} className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-[1100px]" onEscapeKeyDown={event => { if (locked) event.preventDefault(); }} onInteractOutside={event => { if (locked) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>{r && p ? `${r.docNo} - ${p.fund.docNo} ${p.fund.name}` : "Replenishment review"}</DialogTitle><DialogDescription>Review the reconciliation, vouchers, supporting documents and journal before deciding.</DialogDescription></DialogHeader>
    <div role="region" aria-label="Replenishment review details" className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
    {read.loading && <ReviewSkeleton label="Loading replenishment review" />}<ErrorBox error={read.error || null} retry={reload} title="Unable to load this replenishment" /><ErrorBox error={command.error} />
    {data && r && p && <><div><ReplenishmentStatus state={r.state} /></div><div className="grid gap-4 rounded-lg bg-muted/30 p-4 text-sm sm:grid-cols-3">{[["Prepared by", `${r.preparedBy} - ${dateOnly(r.submittedAt)}`], ["Custodian", p.fund.custodian], [pending ? "Approval group" : "Decided by", pending ? "Replenishment Approval" : data.row.decidedBy || r.decidedBy || r.approver || "-"]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>)}</div>
      <dl className="divide-y text-sm">{[["Imprest amount", p.fund.imprest], ["Expected cash", p.fund.expectedCash], ["Cash counted", p.countedCash], ["Over/(short)", p.variance], ["To reimburse", p.reimbursement]].map(([label, value]) => <div key={label} className="grid grid-cols-2 gap-3 py-2"><dt>{label}</dt><dd className="text-right font-medium">{voucherMoney(value)}</dd></div>)}</dl>
      {!!data.blockers.length && <OnboardingFeedback tone="warning" title="Resolve these items before approving"><ul className="list-inside list-disc space-y-1">{data.blockers.map(message => <li key={message}>{message}</li>)}</ul></OnboardingFeedback>}
      <section className="space-y-2"><h2 className="font-medium">Vouchers ({p.vouchers.length})</h2><div className="overflow-x-auto rounded-lg border"><table aria-label="Supporting vouchers" className={table}><thead className="border-b bg-muted/30"><tr>{["Voucher", "Date", "Payee", "Receipts", "Gross", "Cash paid"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{p.vouchers.map(v => <tr key={v.id} className="border-b align-top"><td className="whitespace-nowrap">{v.docNo}</td><td className="whitespace-nowrap">{v.date}</td><td>{v.payee}</td><td>{data.receipts?.filter(l => l.voucherId === v.id).length ? data.receipts.filter(l => l.voucherId === v.id).map((l, i) => <p key={i}>{l.documentType.replaceAll("_", " ")} {l.receiptNo}</p>) : v.receipts.join(", ")}</td><td className="whitespace-nowrap text-right">{voucherMoney(v.gross)}</td><td className="whitespace-nowrap text-right">{voucherMoney(v.netCash)}</td></tr>)}</tbody><tfoot><tr><th colSpan={4} className="text-left">Total</th><td className="whitespace-nowrap text-right">{voucherMoney(sum(p.vouchers.map(v => v.gross)))}</td><td className="whitespace-nowrap text-right">{voucherMoney(sum(p.vouchers.map(v => v.netCash)))}</td></tr></tfoot></table></div></section>
      <section className="space-y-2"><h2 className="font-medium">Supporting documents ({r.attachments.length})</h2>{r.attachments.length ? r.attachments.map(file => <div key={file.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-2 text-sm"><span className="min-w-0 flex-1 break-words">{file.filename} - {(file.fileSize / 1024).toFixed(0)} KB</span>{file.state === "READY" ? <><a className="underline" target="_blank" rel="noreferrer" href={`${APPROVAL_API}/requests/${id}/attachments/${file.id}?view=preview`}>View</a><a className="underline" href={`${APPROVAL_API}/requests/${id}/attachments/${file.id}`}>Download</a></> : <span>Upload incomplete</span>}</div>) : <p className="text-sm text-muted-foreground">No documents attached.</p>}
      </section>
      <section className="space-y-2"><h2 className="font-medium">{pending ? "Journal entry on approval" : "Submitted journal entry"}{data.accountingDate ? ` - ${data.accountingDate}` : ""}</h2><ReplenishmentJournal lines={p.lines} varianceLines={p.reconciliation?.varianceLines} /></section>
      {pending && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="replenishment-decider" className="text-sm font-medium">Approver</label><Input id="replenishment-decider" readOnly value={actorName} /></div><div className="space-y-2"><label htmlFor="replenishment-remarks" className="text-sm font-medium">Remarks (required to reject)</label><Input id="replenishment-remarks" maxLength={1000} value={remarks} disabled={locked || !data.canReject} aria-invalid={Boolean(remarksError)} aria-describedby={remarksError ? "replenishment-remarks-error" : undefined} onChange={event => setRemarks(event.target.value)} />{remarksError && <p id="replenishment-remarks-error" className="text-xs font-medium text-destructive">{remarksError}</p>}</div></div>}

      {!pending && <p className="rounded-lg border p-3 text-sm">{r.state === "POSTED" ? "Posted" : "Rejected"} by {data.row.decidedBy} - {dateTime(data.row.decidedAt)}{data.row.journal ? ` - ${data.row.journal.number}` : ""}{data.row.varianceJournal ? ` - Variance ${data.row.varianceJournal.number}` : ""}{r.decisionReason ? ` - ${r.decisionReason}` : ""}</p>}
      {!!data.history.length && <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Action history</summary><ul className="mt-3 space-y-2">{data.history.map((h, i) => <li key={i}>{dateTime(h.occurredAt)} - {h.actorName} - {h.action.replaceAll("_", " ")}{h.reason ? ` - ${h.reason}` : ""}</li>)}</ul></details>}
    </>}
    {command.uncertain && <p role="status" className="text-sm">The decision outcome is not confirmed. Retry the same decision to safely recover its result.</p>}
    {confirming && data && r && p && !command.uncertain && <DecisionConfirm title={`Approve and post ${r.docNo}?`} description="This posts the replenishment entry and updates the fund balance. It cannot be undone." items={[["Fund", `${p.fund.docNo} · ${p.fund.name}`], ["Cash counted", voucherMoney(p.countedCash)], ["Over / (short)", voucherMoney(p.variance)], ["To reimburse", voucherMoney(p.reimbursement)], ["Posting date", data.accountingDate || "-"]]} confirmLabel="Approve and post" busy={command.busy} onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); void decide("approve"); }} />}
    </div>
    <div className="shrink-0 [&>div]:static [&>div]:mt-0">
    <ReviewActions>{pending && data && p && <div className="w-full basis-full space-y-1"><label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} disabled={locked || !data.canApprove} aria-invalid={Boolean(cashError)} aria-describedby={cashError ? "replenishment-cash-error" : undefined} onChange={event => setConfirmed(event.target.checked)} />{p.reimbursement.startsWith("-") ? `I confirm ${voucherMoney(p.reimbursement.slice(1))} excess cash was returned and the counted cash is correct.` : p.reimbursement === "0.00" ? "I confirm the counted cash and variance; no reimbursement cash is due." : `I confirm ${voucherMoney(p.reimbursement)} reimbursement was received and the counted cash is correct.`}</label>{cashError && <p id="replenishment-cash-error" className="text-xs font-medium text-destructive">{cashError}</p>}</div>}{command.uncertain ? <Button disabled={command.busy} onClick={async () => { const result = await command.retry(); if (result) onChanged(result); }}>{command.busy ? "Checking decision..." : "Retry decision"}</Button> : pending && !confirming && <><Button disabled={locked || !data?.canApprove || !confirmed || Boolean(data?.blockers.length)} onClick={() => setConfirming(true)}>Approve and post</Button><Button variant="destructive" disabled={locked || !data?.canReject || !remarks.trim()} onClick={() => void decide("reject")}>Reject</Button></>}{r && print}<Button variant="outline" disabled={locked} onClick={onClose}>{confirming ? "Close" : "Cancel"}</Button>{command.error && !locked && <Button variant="outline" onClick={reload}>Reload review</Button>}</ReviewActions>
    </div>
  </DialogContent></Dialog>;
}
