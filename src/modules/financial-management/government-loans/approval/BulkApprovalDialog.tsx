"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { peso } from "@/modules/financial-management/cooperative/members/format";
import { bulkApprove } from "./api";
import type { ApprovalQueueItem, BulkApprovalResult } from "./types";

export function BulkApprovalDialog({ rows, onClose, onComplete }: {
  rows: ApprovalQueueItem[];
  onClose: () => void;
  onComplete: (result: BulkApprovalResult) => void;
}) {
  const remarksId = useId();
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const attempt = useRef<{ text: string; key: string } | null>(null);

  async function confirm() {
    if (inFlight.current) return;
    const text = remarks.trim();
    if (attempt.current?.text !== text) attempt.current = { text, key: consignmentRequestId() };
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const items = rows.map(row => ({ id: row.id, expectedRevision: row.revision }));
      onComplete(await bulkApprove(items, text, attempt.current.key));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The approval batch could not be completed. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !inFlight.current) onClose(); }}>
    <DialogContent showCloseButton={!busy} className="flex max-h-[90dvh] min-h-0 flex-col overflow-hidden sm:max-w-xl">
      <DialogHeader className="shrink-0">
        <DialogTitle>Approve {rows.length} {rows.length === 1 ? "request" : "requests"}</DialogTitle>
        <DialogDescription>Each request will be checked again before approval.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-3 overflow-y-auto px-0.5 py-1">
        <p className="text-sm text-muted-foreground">Each request is rechecked when the batch is submitted. Requests that changed or are no longer eligible will be skipped with a reason.</p>
        <ul className="divide-y rounded-md border text-sm">
          {rows.map(row => <li key={row.id} className="break-words px-3 py-2">
            <span className="font-medium">{row.reference}</span> · {row.employeeName ?? "Employee"} · {row.agencyName ?? "Agency"} · {peso(row.amount)}
          </li>)}
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor={remarksId}>Shared remarks (optional)</Label>
          <Textarea id={remarksId} maxLength={500} value={remarks} disabled={busy} onChange={event => setRemarks(event.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter className="shrink-0">
        <Button variant="outline" type="button" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? "Approving…" : "Confirm approval"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
