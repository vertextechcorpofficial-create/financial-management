"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Entry } from "./ledger";
import type { DonationDocument } from "./server/donation-documents";
import { uploadFilingEvidence } from "./server/filing-evidence";
import { submitLedger } from "./ledger-api";
import { MAX_PROOF_BYTES } from "./server/proof-validator.mjs";

export function TaxFilingForm({ entry, defaultDate, existing, onFeedback }: {
  entry: Entry; defaultDate: string; existing?: DonationDocument;
  onFeedback?: (feedback: { error: boolean; text: string }) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(existing?.status ?? "reference-only");
  const [proof, setProof] = useState<{ id: string; filename: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const manual = status === "filed-manually";
  function report(error: boolean, text: string) { setFeedback(text); onFeedback?.({ error, text }); }
  return <form className="grid gap-2" onSubmit={async event => {
     event.preventDefault();
     if (saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    try {
      let uploaded = proof;
      if (manual && !uploaded) {
        const file = fields.get("file");
        if (!(file instanceof File) || file.size > MAX_PROOF_BYTES) { report(true, "Select a PDF, JPEG or PNG supporting file, no larger than 512 KB."); return; }
        const result = await uploadFilingEvidence(fields);
        if (!result.ok) { report(true, result.message); return; }
        uploaded = result.file;
        setProof(uploaded);
      }
      const result = await submitLedger("cgt-filing", { id: entry.id, cgt: true, reference: fields.get("reference"), status,
        filedOn: manual ? fields.get("filedOn") : undefined,
        receiptReference: manual ? fields.get("receiptReference") : undefined,
        evidenceReference: fields.get("evidenceReference") || undefined,
        evidenceFileId: manual ? uploaded?.id : undefined });
      report(!result.ok, result.ok ? "Filing record saved. External BIR filing is not performed by this application." : result.message);
      if (result.ok) router.refresh();
    } catch { report(true, "The filing could not be confirmed. Uploaded evidence is retained for retry."); }
    finally { setSaving(false); }
  }}>
    <p className="text-sm text-muted-foreground">Record manual filing performed externally with BIR. This does not file a return online.</p>
    {existing?.evidenceFile && <p className="text-sm">Current uploaded proof: {existing.evidenceFile.filename}</p>}
    <Input name="reference" aria-label={`Filing reference for JE-${entry.no}`} defaultValue={existing?.reference} required maxLength={200} disabled={saving} />
    <label>Status<select name="status" value={status} disabled={saving} onChange={event => setStatus(event.target.value as typeof status)}>
      <option value="reference-only">Reference only</option><option value="filed-manually">Filed manually</option>
    </select></label>
    {manual && <>
      <label>External filing date<Input name="filedOn" type="date" min={entry.date} defaultValue={existing?.filedOn ?? defaultDate} required disabled={saving} /></label>
      <label>Receipt reference<Input name="receiptReference" defaultValue={existing?.receiptReference ?? ""} maxLength={200} required disabled={saving} /></label>
      <label>Supporting file (required; PDF, JPEG or PNG, maximum 512 KB)<Input name="file" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required={!proof} disabled={saving} onChange={() => setProof(null)} /></label>
      {proof && <p className="text-sm">Uploaded: {proof.filename}. Retained for retry if saving fails.</p>}
    </>}
    <Input name="evidenceReference" aria-label="Optional evidence note" placeholder="Optional evidence note (not a substitute for upload)" defaultValue={existing?.evidenceReference ?? ""} maxLength={200} disabled={saving} />
    <Button type="submit" disabled={saving}>{saving ? "Saving..." : manual ? "Mark filed" : "Save reference"}</Button>
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
  </form>;
}
