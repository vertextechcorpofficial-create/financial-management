"use client";

import { useId, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { RequestCapacity } from "../requests/RequestCapacity";
import { RequestDetails, RequestSection } from "../requests/RequestReview";
import { RequestApiError } from "../requests/request-api";
import { approvalDocumentUrl, decideApproval } from "./api";
import type { ApprovalReview, CompanyDecision } from "./types";

export function ApprovalReviewPanel({ review, onBack, onReload, onDecision }: {
  review: ApprovalReview;
  onBack: () => void;
  onReload: () => void;
  onDecision: (message: string) => void;
}) {
  const { request, currentAssessment } = review;
  const remarksId = useId();
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<{ message: string; conflict: boolean }>();
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<CompanyDecision | null>(null);
  const inFlight = useRef(false);
  const attempt = useRef<{ action: CompanyDecision; text: string; key: string } | null>(null);

  function requestDecision(action: CompanyDecision) {
    if (action === "REJECT" && !remarks.trim()) {
      setError({ message: "Enter a reason for rejecting the request.", conflict: false });
      return;
    }
    setError(undefined);
    setConfirmAction(action);
  }

  async function decide(action: CompanyDecision) {
    if (inFlight.current) return;
    const text = remarks.trim();
    if (action === "REJECT" && !text) {
      setError({ message: "Enter a reason for rejecting the request.", conflict: false });
      return;
    }
    if (attempt.current?.action !== action || attempt.current.text !== text) {
      attempt.current = { action, text, key: consignmentRequestId() };
    }
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const saved = await decideApproval(request.id, request.revision, action, text, attempt.current.key);
      onDecision(`${saved.reference} ${saved.decision === "APPROVED" ? "approved" : "rejected"}.`);
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "Could not record the decision. Try again.",
        conflict: cause instanceof RequestApiError && cause.status === 409 });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button type="button" variant="ghost" disabled={busy} onClick={onBack}><ArrowLeft /> Back to approvals</Button>
      {request.requestedAt && <p className="text-sm text-muted-foreground">Filed {dateTime(request.requestedAt)} PHT</p>}
    </div>
    {request.status === "APPROVED" && <p className="text-sm font-medium">Approved — awaiting agency</p>}
    <RequestDetails record={request} documentHref={kind => approvalDocumentUrl(request.id, kind)} />
    {request.status === "REQUESTED" && <>
      {currentAssessment && <RequestSection title="Current checks">
        <RequestCapacity capacity={currentAssessment.capacity} checks={currentAssessment.checks} />
      </RequestSection>}
      <RequestSection title="Company decision">
        <div className="space-y-1.5">
          <Label htmlFor={remarksId}>Remarks</Label>
          <Textarea id={remarksId} value={remarks} maxLength={500} disabled={busy} aria-describedby={remarksId + "-help"}
            onChange={event => setRemarks(event.target.value)} />
          <p id={remarksId + "-help"} className="text-xs text-muted-foreground">Optional when approving. Required when rejecting.</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        <div className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
          {error?.conflict ? <Button type="button" variant="outline" onClick={onReload}>Reload request</Button> : <>
            <Button type="button" variant="outline" className="text-destructive" disabled={busy} onClick={() => requestDecision("REJECT")}>Reject</Button>
            <Button type="button" disabled={busy} onClick={() => requestDecision("APPROVE")}>{busy ? "Saving decision…" : "Approve"}</Button>
          </>}
        </div>
      </RequestSection>
    </>}
    <AlertDialog open={confirmAction !== null} onOpenChange={open => { if (!open && !busy) setConfirmAction(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmAction === "APPROVE" ? "Approve" : "Reject"} {request.reference}?</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmAction === "APPROVE"
              ? "The request will move to approved and await agency terms in Enrollment."
              : "The request will be rejected and the employee will see your reason."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Employee</dt><dd className="text-right font-medium">{request.employeeName ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Agency / program</dt><dd className="text-right font-medium">{request.agencyName ?? "—"} · {request.form.program || "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Amount</dt><dd className="text-right font-medium">{peso(request.form.amount)}</dd></div>
          {remarks.trim() && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Remarks</dt><dd className="max-w-64 text-right font-medium">{remarks.trim()}</dd></div>}
        </dl>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Back to request</AlertDialogCancel>
          <Button type="button" disabled={busy} onClick={() => {
            if (!confirmAction) return;
            const action = confirmAction;
            setConfirmAction(null);
            void decide(action);
          }}>Confirm {confirmAction === "APPROVE" ? "approval" : "rejection"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
