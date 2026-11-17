"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFundRead } from "../hooks/useFunds";
import { ErrorBox } from "./OnboardingCommon";
import { VoucherReviewSkeleton } from "./PettyCashSkeletons";
import { ReviewActions } from "./ReviewActions";
import { ReceiptTable, voucherMoney, voucherStatus } from "./VoucherReview";
import { dateTime } from "../utils/dateTime";
import type { VoucherDecision } from "../voucher-approval-types";

export function VoucherDecisionDetails({ id, onClose }: { id: number; onClose: () => void }) {
  const read = useFundRead<VoucherDecision>(`disbursement-approval/decisions/${id}`), data = read.data, value = data?.before, target = value ? value.proposed || value.effective : null;
  const resource = `/api/fm/petty-cash/disbursement-approval/decisions/${id}`;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] min-w-0 grid-cols-1 overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>{value ? `${value.voucher.docNo} · ${data?.decision === "APPROVED" ? "Approved" : "Rejected"}` : "Voucher decision"}</DialogTitle><DialogDescription>Recorded decision details. Later voucher changes do not alter this snapshot.</DialogDescription></DialogHeader>
    {read.loading && <VoucherReviewSkeleton />}<ErrorBox error={read.error || null} retry={read.refresh} title="Could not load voucher decision" />
    {data && value && target && <><dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-3">{[["Fund", `${value.fundDocNo} · ${value.fundName}`], ["Revision", String(target.number)], ["Payee", target.saved.payee.name], ["Prepared by", target.preparedBy], ["Decided by", data.decidedBy], ["Decided at", dateTime(data.decidedAt)], ["Status after decision", voucherStatus(data.stateAfter)], ["Cash paid before", voucherMoney(value.paidNetCash)], ["Cash paid after", voucherMoney(data.paidAfter)], ["Cash-box movement", voucherMoney(data.cashMovement)], ["Cash on hand after", voucherMoney(data.cashAfter)]].map(([label, text]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{text}</dd></div>)}</dl>
      {data.reason && <p className="whitespace-pre-wrap rounded-lg border p-3 text-sm"><strong>Reason:</strong> {data.reason}</p>}<p className="text-sm">{target.saved.date} · {target.saved.particulars}</p>
      {value.proposed && <div className="rounded-lg border p-3 text-sm"><h2 className="font-medium">Correction reviewed</h2><p>Gross: {voucherMoney(value.effective.saved.totals.gross)} → {voucherMoney(target.saved.totals.gross)}</p><p>Net cash: {voucherMoney(value.effective.saved.totals.netCash)} → {voucherMoney(target.saved.totals.netCash)}</p><p>Original particulars: {value.effective.saved.particulars}</p></div>}
      <ReceiptTable revision={target} />{target.attachments.length > 0 && <section className="space-y-2"><h2 className="font-medium">Supporting documents at review</h2><div className="flex flex-wrap gap-2">{target.attachments.filter(file => file.state === "READY").map(file => <Button key={file.id} variant="outline" size="sm" asChild><a className="max-w-full truncate" href={`${resource}/attachments/${file.id}?view=preview`} target="_blank" rel="noreferrer">{file.filename}</a></Button>)}</div></section>}
    </>}
    <ReviewActions align="end">{data && <Button variant="outline" asChild><a href={`${resource}/print`} target="_blank" rel="noreferrer">Print decision</a></Button>}<Button variant="outline" onClick={onClose}>Close</Button></ReviewActions>
  </DialogContent></Dialog>;
}
