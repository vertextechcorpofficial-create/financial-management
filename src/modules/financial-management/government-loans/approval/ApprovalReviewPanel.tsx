"use client";

import { useId, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { dateTime } from "@/modules/financial-management/cooperative/members/format";
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
  const inFlight = useRef(false);
  const attempt = useRef<{ action: CompanyDecision; text: string; key: string } | null>(null);

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
        <div className="flex flex-wrap justify-end gap-2">
          {error?.conflict ? <Button type="button" variant="outline" onClick={onReload}>Reload request</Button> : <>
            <Button type="button" variant="outline" className="text-destructive" disabled={busy} onClick={() => void decide("REJECT")}>Reject</Button>
            <Button type="button" disabled={busy} onClick={() => void decide("APPROVE")}>{busy ? "Saving decision…" : "Approve"}</Button>
          </>}
        </div>
      </RequestSection>
    </>}
  </div>;
}
