"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { RequestCapacity } from "./RequestCapacity";
import { RequestApiError, staffRequestApi } from "./request-api";
import { canCancelRequest } from "./request-rules";
import {
  applicationTypes, requestDecisionLabels, requestStatusLabels, type DocumentKind, type LoanRequest,
} from "./types";

export function RequestSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4 rounded-lg border bg-card p-4" aria-label={title}>
    <h3 className="text-sm font-semibold">{title}</h3>
    {children}
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
    <RequestDetails record={record} documentHref={kind => api.requestDocumentUrl(record.id, kind)} />
  </div>;
}
