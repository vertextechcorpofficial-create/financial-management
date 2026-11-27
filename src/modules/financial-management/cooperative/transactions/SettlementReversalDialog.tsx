"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConsoleDialog, Kv, Panel } from "../console/components/ui";
import { useClearanceMutation } from "../console/clearance/useClearanceData";
import { memberFetch } from "../members/client";
import { date, peso } from "../members/format";
import type { SettlementReversalPreview } from "../server/clearance-reversal";
import { transactionLabels } from "./entries";

export function SettlementReversalDialog({ id, onClose, onPosted }: {
  id: number;
  onClose: () => void;
  onPosted: (reference: string) => void;
}) {
  const [preview, setPreview] = useState<SettlementReversalPreview>();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mutation = useClearanceMutation(failure => {
    if (failure.code === "CLEARANCE_STALE") setPreview(undefined);
  });
  const busy = loading || mutation.busy;
  const path = `/api/fm/cooperative/transactions/settlements/${id}/reversal`;

  async function submit() {
    if (busy) return;
    if (preview) {
      const result = await mutation.save(path, "POST", { action: "post", reason, fingerprint: preview.fingerprint, confirmed: true });
      if (result) onPosted(result.reference);
      return;
    }
    mutation.clearError();
    setError("");
    setLoading(true);
    try {
      setPreview(await memberFetch<SettlementReversalPreview>(path, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview" }),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to review settlement reversal.");
    } finally {
      setLoading(false);
    }
  }

  return <ConsoleDialog open wide title="Reverse settlement" description={preview?.reference ?? "Review the entries linked to this settlement."}
    onOpenChange={open => { if (!open && !busy) onClose(); }}
    footer={<>
      <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button variant={preview ? "destructive" : "default"} disabled={busy || (Boolean(preview) && !reason.trim())}
        onClick={() => void submit()}>{busy ? "Please wait…" : preview ? "Confirm reversal" : "Review reversal"}</Button>
    </>}>
    {(error || mutation.error) && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
      {error || mutation.error?.message}
    </p>}
    {preview && <>
      <Panel title="Balances after reversal">
        <Kv rows={[
          ["Posting date", date(preview.date)], ["Membership", "Separated"], ["Savings restored", peso(preview.savingsRestored)],
          ["Final-pay withholding reversed", peso(preview.finalPayWithholdingReversed)], ["Refund payable reversed", peso(preview.refundPayableReversed)],
        ]} />
        {preview.loans.length > 0 && <div className="mt-3 space-y-2 border-t pt-3">
          <h2 className="text-sm font-semibold">Loans in collection review</h2>
          <Kv rows={preview.loans.map(loan => [loan.reference, peso(loan.remaining)])} />
        </div>}
      </Panel>
      <Panel title="Journals to reverse">
        <Kv rows={preview.journals.map(journal => [`${journal.number} · ${transactionLabels[journal.category]}`, peso(journal.amount)])} />
      </Panel>
      <label className="block space-y-1 text-sm">Reversal reason
        <Textarea disabled={busy} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} />
      </label>
    </>}
  </ConsoleDialog>;
}
