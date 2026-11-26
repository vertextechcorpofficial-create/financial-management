"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { RequestCapacity } from "./RequestCapacity";
import { RequestApiError, staffRequestApi } from "./request-api";
import { canCancelRequest } from "./request-rules";
import {
  applicationTypes, requestDecisionLabels, requestStatusLabels, requestStatusTone,
  type DocumentKind, type LoanRequest, type RequestStatus,
} from "./types";

export function RequestSection({ title, step, children }: { title: string; step?: number; children: ReactNode }) {
  return <section className="space-y-4 rounded-lg border bg-card p-4" aria-label={title}>
    <h3 className="text-sm font-semibold">{step ? `${step} · ` : ""}{title}</h3>
    {children}
  </section>;
}

const requestStages: { status: RequestStatus; label: string }[] = [
  { status: "DRAFT", label: "Draft" },
  { status: "REQUESTED", label: "Requested" },
  { status: "APPROVED", label: "Approved" },
  { status: "ENROLLED", label: "For verification" },
  { status: "VERIFIED", label: "Verified" },
  { status: "ACTIVE", label: "Active" },
];
const requestStage: Partial<Record<RequestStatus, number>> = {
  DRAFT: 0, REQUESTED: 1, APPROVED: 2, ENROLLED: 3, RETURNED: 3, VERIFIED: 4, ACTIVATING: 4, ACTIVE: 5,
};
const terminalStatuses: RequestStatus[] = ["REJECTED", "CANCELLED", "AGENCY_DECLINED"];
const nextStep: Record<RequestStatus, string> = {
  DRAFT: "Complete the required request fields and submit for approval.",
  REQUESTED: "Waiting for company approval.",
  APPROVED: "Approved. Record the agency terms and evidence in Enrollment.",
  REJECTED: "The request was rejected. Review the decision history below.",
  CANCELLED: "The request was cancelled.",
  ENROLLED: "Waiting for enrollment verification.",
  RETURNED: "Correct the returned enrollment and resubmit it for verification.",
  VERIFIED: "Verified. Ready for activation.",
  ACTIVATING: "Activation is in progress.",
  ACTIVE: "The loan is active and deductions are scheduled.",
  AGENCY_DECLINED: "The agency did not approve the loan.",
};

export function RequestStatusSummary({ record, reason }: { record: LoanRequest; reason?: string | null }) {
  const current = requestStage[record.status] ?? -1;
  const terminal = terminalStatuses.includes(record.status);
  const latestReason = reason ?? [...record.decisionHistory].reverse()
    .find(event => event.reason || event.remarks)?.reason ??
    [...record.decisionHistory].reverse().find(event => event.remarks)?.remarks;
  return <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Request status">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current status</p>
        <p className="text-base font-semibold">{requestStatusLabels[record.status]}</p>
      </div>
      <Badge variant="outline" className={requestStatusTone[record.status]}>{requestStatusLabels[record.status]}</Badge>
    </div>
    {!terminal && current >= 0 && <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Request progress">
      {requestStages.map((stage, index) => <li key={stage.status}
        className={"rounded-full border px-2 py-0.5 " + (index < current ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          : index === current ? "border-primary bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        {stage.label}
      </li>)}
    </ol>}
    <p className="text-sm text-muted-foreground">{nextStep[record.status]}</p>
    {latestReason && (terminal || record.status === "RETURNED") && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p className="font-medium">{record.status === "RETURNED" ? "Return reason" : "Decision reason"}</p>
      <p className="whitespace-pre-wrap break-words">{latestReason}</p>
    </div>}
  </section>;
}

export function RequestDetails({ record, documentHref }: { record: LoanRequest; documentHref: (kind: DocumentKind) => string }) {
  const { form, filedAssessment } = record;
  return <>
    <RequestSection title={record.reference + " · " + requestStatusLabels[record.status]}>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <p>{record.employeeName} · {form.employeeId}</p><p>{record.agencyName} · {form.program}</p>
        <p>{form.applicationType && applicationTypes[form.applicationType]} · {peso(form.amount)} · {form.term} months</p>
        {form.renewalLoanId && <p>Renewal loan {form.renewalLoanId}</p>}
        {form.coMakerId && <p>Co-maker {form.coMakerId}{form.coMakerRelationship && " · " + form.coMakerRelationship}</p>}
        {form.purpose && <p>{form.purpose}</p>}{form.payout && <p>{form.payout}</p>}
        {form.agencyReference && <p>Agency application {form.agencyReference}</p>}
        {form.agencyFiledOn && <p>Filed with agency {date(form.agencyFiledOn)}</p>}
      </div>
      {form.remarks && <p className="whitespace-pre-wrap break-words text-sm">{form.remarks}</p>}
      <p className="text-sm">Authority to deduct and data-sharing consent recorded.</p>
    </RequestSection>
    <RequestSection title="At submission">
      {filedAssessment ? <RequestCapacity capacity={filedAssessment.capacity} checks={filedAssessment.checks} /> :
        <p className="text-sm text-muted-foreground">Assessment unavailable.</p>}
    </RequestSection>
    {record.documents.length > 0 && <RequestSection title="Documents">
      <ul className="space-y-1 text-sm">{record.documents.map(document => <li key={document.id}>
        <a className="break-words text-primary underline" href={documentHref(document.kind)}>{document.name}</a>
      </li>)}</ul>
    </RequestSection>}
    <RequestDecisionHistory items={record.decisionHistory} />
  </>;
}

export function RequestDecisionHistory({ items }: { items: LoanRequest["decisionHistory"] }) {
  return <RequestSection title="Decision history">
      {items.length > 0 ? <ol className="divide-y text-sm">
        {items.map(event => <li key={event.id} className="space-y-1 py-2 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <p className="font-medium">{requestDecisionLabels[event.action]}</p>
            <time className="text-xs text-muted-foreground" dateTime={event.occurredAt}>{dateTime(event.occurredAt)} PHT</time>
          </div>
          <p className="text-xs text-muted-foreground">
            {event.actorName} · {event.fromStatus && requestStatusLabels[event.fromStatus] + " → "}{requestStatusLabels[event.toStatus]}
          </p>
          {(event.reason || event.remarks) && <p className="whitespace-pre-wrap break-words">{event.reason || event.remarks}</p>}
        </li>)}
      </ol> : <p className="text-sm text-muted-foreground">No decisions recorded.</p>}
    </RequestSection>;
}

export function RequestReview({ record, onBack, onCancelled, onReload, api = staffRequestApi }: {
  record: LoanRequest; onBack: () => void; onCancelled: () => void; onReload: () => void;
  api?: typeof staffRequestApi;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const attempt = useRef<{ reason: string; key: string } | null>(null);

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const text = reason.trim();
      if (attempt.current?.reason !== text) attempt.current = { reason: text, key: consignmentRequestId() };
      await api.cancelRequest(record, text, attempt.current.key);
      setOpen(false);
      onCancelled();
    } catch (cause) {
      setError({
        message: cause instanceof Error ? cause.message : "The request could not be cancelled.",
        conflict: cause instanceof RequestApiError && cause.status === 409,
      });
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button type="button" variant="ghost" onClick={onBack}><ArrowLeft /> Back to requests</Button>
      {canCancelRequest(record.status) && <AlertDialog open={open} onOpenChange={next => {
        if (busy) return;
        if (next) { setReason(""); setError(null); }
        setOpen(next);
      }}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" className="text-destructive">Cancel request</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {record.reference}?</AlertDialogTitle>
            <AlertDialogDescription>The request will move to Decided and can no longer be enrolled.</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="block space-y-1.5 text-sm">
            <span className="block font-medium">Reason (optional)</span>
            <Textarea value={reason} maxLength={500} disabled={busy} onChange={event => setReason(event.target.value)} />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep request</AlertDialogCancel>
            {error?.conflict ? <Button type="button" onClick={onReload}>Reload request</Button> :
              <Button type="button" variant="destructive" disabled={busy} onClick={() => void cancel()}>
                {busy ? "Cancelling…" : "Confirm cancellation"}
              </Button>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>
    <RequestStatusSummary record={record} />
    <RequestDetails record={record} documentHref={kind => api.requestDocumentUrl(record.id, kind)} />
  </div>;
}
