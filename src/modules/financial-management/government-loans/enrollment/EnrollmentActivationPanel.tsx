"use client";

import { useRef, useState } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { payrollAcknowledgementTemplate } from "../payroll-handoff/file-exchange";
import { RequestSection } from "../requests/RequestReview";
import { RequestApiError } from "../requests/request-api";
import { activateEnrollment, importPayrollAcknowledgement } from "./verification-api";
import type { VerificationReview } from "./verification-types";

export function EnrollmentActivationPanel({ review, onSaved, reload }: {
  review: VerificationReview; onSaved: (message: string) => void; reload: () => void;
}) {
  const { record, canActivate, canManageHandoff } = review;
  const { id, request: { revision }, payrollHandoff } = record;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<{ message: string; conflict: boolean }>();
  const activationKey = useRef<string | null>(null);

  async function run(save: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const notice = await save();
      setOpen(false);
      onSaved(notice);
    } catch (cause) {
      setError({
        message: cause instanceof Error ? cause.message : "The Payroll handoff could not be updated. Try again.",
        conflict: cause instanceof RequestApiError && cause.status === 409,
      });
    } finally {
      setBusy(false);
    }
  }

  const errorMessage = error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
    <span>{error.message}</span>
    {error.conflict && <Button type="button" variant="outline" size="sm" onClick={reload}>Reload review</Button>}
  </div>;

  if (record.status === "VERIFIED") return <RequestSection title="Finish activation">
    {!canActivate ? <p className="text-sm">A staff member distinct from the encoder and resubmitter must finish activation.</p> :
      <AlertDialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
        <AlertDialogTrigger asChild>
          <Button type="button" disabled={review.checks.some(check => check.reason)}>Finish activation</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate {record.reference}?</AlertDialogTitle>
            <AlertDialogDescription>Financial Management will activate the loan and record its Payroll instructions.</AlertDialogDescription>
          </AlertDialogHeader>
          {errorMessage}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button type="button" disabled={busy || error?.conflict} onClick={() => void run(async () => {
              activationKey.current ??= consignmentRequestId();
              await activateEnrollment(id, revision, activationKey.current);
              return "Enrollment activated. Payroll instructions are ready to download.";
            })}>{busy ? "Activating…" : "Confirm activation"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
  </RequestSection>;

  if (!payrollHandoff || !canManageHandoff) return null;
  if (payrollHandoff.fileExchange && payrollHandoff.state === "QUEUED") return <p className="text-sm text-muted-foreground">
    Download the instructions from Loans → Payroll instructions before importing the acknowledgement.
  </p>;

  return <RequestSection title="Record Payroll acknowledgement">
    <p className="text-sm text-muted-foreground">
      Import the CSV confirmed by Payroll. Use ACCEPTED, REJECTED, or NOT_APPLIED with a receipt reference and timestamp for each instruction. A retry needs a new confirmation for the latest delivery.
    </p>
    <p className="text-sm text-muted-foreground">For an accepted start, include the Payroll loan ID, exact monthly amount, and remaining installments. For a rejected or unapplied instruction, include the reason.</p>
    <a href={"data:text/csv;charset=utf-8," + encodeURIComponent(payrollAcknowledgementTemplate(payrollHandoff.payload))}
      download="payroll-acknowledgement-template.csv" className="text-sm text-primary underline">
      Download acknowledgement template
    </a>
    <label className="block space-y-1.5 text-sm">
      <span className="block font-medium">Payroll acknowledgement CSV</span>
      <Input className="max-w-md" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => {
        setFile(event.target.files?.[0] ?? null);
        if (!error?.conflict) setError(undefined);
      }} />
    </label>
    {errorMessage}
    <Button type="button" disabled={!file || busy || error?.conflict} onClick={() => {
      if (file) void run(async () => {
        await importPayrollAcknowledgement(id, revision, file);
        return "Payroll acknowledgement recorded.";
      });
    }}>{busy ? "Importing…" : "Import acknowledgement"}</Button>
  </RequestSection>;
}
