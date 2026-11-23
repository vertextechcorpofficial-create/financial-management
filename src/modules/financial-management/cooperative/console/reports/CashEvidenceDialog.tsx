"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { memberFetch, MemberApiError } from "../../members/client";
import { date } from "../../members/format";
import { cashEvidenceLabels, type CashEvidenceContext } from "./types";

export function CashEvidenceDialog({ evidence, onClose, onSave, onRefresh }: {
  evidence: CashEvidenceContext;
  onClose: () => void;
  onSave: () => void;
  onRefresh: () => void;
}) {
  const correcting = evidence.revision > 0;
  const label = cashEvidenceLabels[evidence.purpose].toLowerCase();
  const [amount, setAmount] = useState(evidence.amount ?? "");
  const [reference, setReference] = useState(evidence.reference ?? "");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; stale?: boolean }>();
  const validAmount = /^-?\d{1,10}(?:\.\d{1,2})?$/.test(amount.trim()) && (evidence.purpose === "CASH_IN_BANK" || Number(amount) >= 0);
  const canSave = validAmount && reference.trim() && (!correcting || reason.trim()) && confirmed && !saving && !error?.stale;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(undefined);
    try {
      await memberFetch("/api/fm/cooperative/reports/evidence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodEnd: evidence.periodEnd, purpose: evidence.purpose, accountId: evidence.accountId,
          amount, reference, reason, expectedRevision: evidence.revision,
        }),
      });
      onSave();
    } catch (cause) {
      setError({
        message: cause instanceof Error ? cause.message : "The evidence could not be saved.",
        stale: cause instanceof MemberApiError && cause.payload?.code === "EVIDENCE_CHANGED",
      });
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
      <DialogTitle>{correcting ? "Correct " : "Record "}{label}</DialogTitle>
      <DialogDescription>{evidence.accountLabel} · As of {date(evidence.periodEnd)}</DialogDescription>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label className="block space-y-1 text-sm font-medium">
          <span className="block">Verified amount (PHP)</span>
          <Input value={amount} inputMode="decimal" maxLength={14} required
            aria-invalid={Boolean(amount && !validAmount)} onChange={event => { setAmount(event.target.value); setConfirmed(false); }} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span className="block">Source reference</span>
          <Input value={reference} maxLength={160} required onChange={event => { setReference(event.target.value); setConfirmed(false); }} />
        </label>
        {correcting && <label className="block space-y-1 text-sm font-medium">
          <span className="block">Correction reason</span>
          <Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required rows={2} />
        </label>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-primary" checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)} />
          <span>I verified this amount against the {label} as of the selected month end.</span>
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        <DialogFooter>
          <Button variant="outline" type="button" disabled={saving} onClick={onClose}>Cancel</Button>
          {error?.stale
            ? <Button type="button" onClick={onRefresh}>Refresh worksheet</Button>
            : <Button type="submit" disabled={!canSave}>{saving ? "Saving…" : "Save verified evidence"}</Button>}
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
