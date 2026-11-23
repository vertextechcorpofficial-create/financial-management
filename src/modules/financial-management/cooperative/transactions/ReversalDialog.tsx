"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConsoleDialog, Kv, Panel, StatusChip } from "../console/components/ui";
import { MemberApiError, memberFetch, newRequestKey } from "../members/client";
import { date, peso } from "../members/format";
import type { LoanPaymentResult, LoanReversalPreview } from "../server/loan-payments";

export type ReversiblePayment = {
  id: number;
  loanId: number;
  journalNo: string;
  loanNo: string | null;
  memberName: string;
  amount: string;
  businessDate: string;
};

export function ReversalDialog({ row, endpoint, onClose, onPosted }: {
  row: ReversiblePayment;
  endpoint: string;
  onClose: () => void;
  onPosted: (result: LoanPaymentResult) => void;
}) {
  const [review, setReview] = useState<{ preview: LoanReversalPreview; key: string }>();
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (working) return;
    setWorking(true);
    setError("");
    const url = `${endpoint}/${row.loanId}/reversal`;
    const request = (body: Record<string, unknown>) => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId: row.id, ...body }),
    });
    try {
      if (review) {
        onPosted(await memberFetch<LoanPaymentResult>(url, request({
          action: "post", reason, requestKey: review.key,
          revision: review.preview.revision, fingerprint: review.preview.fingerprint,
        })));
      } else {
        const preview = await memberFetch<LoanReversalPreview>(url, request({ action: "preview" }));
        setReview({ preview, key: newRequestKey() });
      }
    } catch (cause) {
      if (cause instanceof MemberApiError && cause.payload?.code === "STALE_LOAN_REVIEW") setReview(undefined);
      setError(cause instanceof Error ? cause.message : "Unable to reverse the payment.");
    } finally {
      setWorking(false);
    }
  }

  const preview = review?.preview;
  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open && !working) onClose(); }}
      title="Reverse loan payment"
      description={`${row.loanNo ?? row.journalNo} · ${row.memberName}`}
      footerClassName="sticky bottom-0 z-20 -mx-6 -mb-6 mt-4 border-t bg-background/95 px-6 py-3 backdrop-blur"
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={working}>Cancel</Button>
        <Button
          variant={preview ? "destructive" : "default"}
          disabled={working || (Boolean(preview) && !reason.trim())}
          onClick={() => void submit()}
        >
          {working && <Loader2 className="size-4 animate-spin" />}
          {working ? "Please wait..." : preview ? "Confirm reversal" : "Review reversal"}
        </Button>
      </>}
      wide
    >
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      <Panel title="Reversal review">
        <Kv rows={[
          ["Original posting date", date(row.businessDate)],
          ["Original journal", row.journalNo],
          ["Amount to reverse", peso(row.amount)],
          ...(preview ? [
            ["Reversal posting date", date(preview.date)],
            ["Current installment balance", peso(preview.currentBalance)],
            ["Installment balance after reversal", peso(preview.afterBalance)],
            ["Penalties after reversal", peso(preview.afterPenalties)],
            ["Loan status after reversal", preview.status === "FULLY_PAID" ? "Fully paid" : "Active"],
          ] as [string, string][] : []),
        ]} />
      </Panel>
      {preview && (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[560px]">
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Affected installment</TableHead>
                  <TableHead className="text-right">Paid after reversal</TableHead>
                  <TableHead className="text-right">Penalty paid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.installments.map(item => (
                  <TableRow key={item.no} className="hover:bg-muted/30">
                    <TableCell>{item.no}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{peso(item.paid)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{peso(item.penaltyPaid)}</TableCell>
                    <TableCell><StatusChip status={item.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <label className="block space-y-1 text-sm">
            <span>Reversal reason</span>
            <Textarea
              value={reason}
              onChange={event => { setReason(event.target.value); setReview({ preview, key: newRequestKey() }); }}
              maxLength={500}
              disabled={working}
              required
            />
          </label>
        </>
      )}
    </ConsoleDialog>
  );
}
