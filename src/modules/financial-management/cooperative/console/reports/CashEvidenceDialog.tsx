"use client";

import { useState } from "react";
import { AlertTriangle, Banknote, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { date } from "../../members/format";
import { memberFetch, MemberApiError } from "../../members/client";
import { ConsoleDialog } from "../components/ui";
import { cashEvidenceLabels, type CashEvidenceContext } from "./types";

export function CashEvidenceDialog({ evidence, onClose, onSave, onRefresh }: {
  evidence: CashEvidenceContext;
  onClose: () => void;
  onSave: () => void;
  onRefresh: () => void;
}) {
  const correcting = evidence.revision > 0;
  const label = cashEvidenceLabels[evidence.purpose].toLowerCase();
  const Icon = evidence.purpose === "CASH_ON_HAND" ? Banknote : Landmark;
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

  return <ConsoleDialog open onOpenChange={open => { if (!open && !saving) onClose(); }}
    title={correcting ? "Correct " + label : "Record " + label}
    description="Month-end reconciliation evidence"
    footer={<>
      <Button variant="outline" type="button" disabled={saving} onClick={onClose}>Cancel</Button>
      {error?.stale
        ? <Button type="button" onClick={onRefresh}>Refresh worksheet</Button>
        : <Button type="submit" form="cash-evidence" disabled={!canSave}>{saving ? "Saving…" : "Save verified evidence"}</Button>}
    </>}>
    <form className="space-y-4" id="cash-evidence" onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground"><Icon className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{cashEvidenceLabels[evidence.purpose]}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{evidence.accountLabel} · Month-end {date(evidence.periodEnd)}</p>
        </div>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p className="min-w-0 break-words">{error.message}</p>
      </div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm">Verified amount (PHP)
          <Input value={amount} inputMode="decimal" maxLength={14} required disabled={saving}
            aria-invalid={Boolean(amount && !validAmount)} onChange={event => { setAmount(event.target.value); setConfirmed(false); }} />
          <span className="block text-xs text-muted-foreground">Enter the amount shown on the verified {label}.</span>
        </label>
        <label className="block space-y-1.5 text-sm">Source reference
          <Input value={reference} maxLength={160} required disabled={saving}
            onChange={event => { setReference(event.target.value); setConfirmed(false); }} />
        </label>
      </div>

      {correcting && <label className="block space-y-1.5 text-sm">Correction reason
        <Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required rows={2} disabled={saving} />
      </label>}

      <label className="flex items-start gap-2 rounded-xl border bg-muted/20 p-3 text-sm">
        <input type="checkbox" className="mt-1 accent-primary" checked={confirmed} disabled={saving}
          onChange={event => setConfirmed(event.target.checked)} />
        <span>I verified this amount against the {label} as of the selected month end.</span>
      </label>
    </form>
  </ConsoleDialog>;
}
