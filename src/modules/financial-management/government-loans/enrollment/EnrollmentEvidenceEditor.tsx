"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { enrollmentEvidenceKinds } from "../requests/types";
import { EnrollmentApiError, enrollmentEvidenceUrl, setEnrollmentTransfer, uploadEnrollmentEvidence } from "./api";
import { EnrollmentEvidenceList } from "./EnrollmentDetails";
import type { EnrollmentDetail } from "./types";

export function EnrollmentEvidenceEditor({ record, onChanged }: { record: EnrollmentDetail; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean }>();
  const [transfer, setTransfer] = useState(record.enrollment?.importTransfer === undefined ? "" : record.enrollment.importTransfer ? "yes" : "no");
  const attempt = useRef<{ send: () => Promise<unknown> } | null>(null);
  const editable = record.status === "RETURNED" || record.status === "ENROLLED";

  async function change(send: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    attempt.current = { send };
    try {
      await send();
      onChanged();
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "The evidence could not be saved.",
        conflict: cause instanceof EnrollmentApiError && cause.status === 409 });
    } finally {
      setBusy(false);
    }
  }

  const showTransfer = record.enrollment?.origin === "IMPORT" && record.enrollment.installmentsPaid === 0;
  const currentTransfer = record.enrollment?.importTransfer;
  return <div className="space-y-2">
    <EnrollmentEvidenceList record={record} href={kind => enrollmentEvidenceUrl(record.id, kind)}
      transferControl={showTransfer && <div className="flex flex-wrap items-end gap-2 text-sm">
        {editable ? <>
          <label className="space-y-1">
            <span className="block font-medium">Transferred from a previous employer?</span>
            <NativeSelect value={transfer} disabled={busy} onChange={event => setTransfer(event.target.value)}>
              <option value="">Choose yes or no</option><option value="yes">Yes</option><option value="no">No</option>
            </NativeSelect>
          </label>
          <Button type="button" variant="outline" size="sm" disabled={busy || !transfer || (transfer === "yes") === currentTransfer}
            onClick={() => {
              const key = consignmentRequestId();
              void change(() => setEnrollmentTransfer(record, transfer === "yes", key));
            }}>Save transfer status</Button>
        </> : <p>Transferred from a previous employer · {currentTransfer === true ? "Yes" : currentTransfer === false ? "No" : "Unconfirmed"}</p>}
      </div>}
      controls={editable ? kind => <Input type="file" accept=".pdf,.png,.jpg,.jpeg" className="max-w-72" disabled={busy}
        aria-label={(record.evidence.some(item => item.kind === kind) ? "Replace " : "Attach ") + enrollmentEvidenceKinds[kind]}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const key = consignmentRequestId();
          void change(() => uploadEnrollmentEvidence(record, kind, file, key));
        }} /> : undefined} />
    {editable && <p className="text-xs text-muted-foreground">PDF, PNG or JPEG. Up to 5 MB per file.</p>}
    {busy && <p role="status" className="text-sm text-muted-foreground">Saving evidence…</p>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
      {error.message}
      {error.conflict ? <Button type="button" variant="outline" size="sm" onClick={onChanged}>Reload enrollment</Button> :
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => {
          if (attempt.current) void change(attempt.current.send);
        }}>Retry</Button>}
    </div>}
  </div>;
}
