"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createSetupMaster, getSetupMasterOptions } from "../providers/bankReconciliationSetupApi";
import type { AccountReference, CompanyReference } from "../reference-types";
import type { MasterOptions } from "../setup-types";

export type NewReference = "companies" | "accounts";
export function CreateReferenceDialog({ kind, onClose, onCreated }: {
  kind: NewReference | null; onClose: () => void;
  onCreated: (kind: NewReference, item: CompanyReference | AccountReference) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({}), [options, setOptions] = useState<MasterOptions | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    if (!kind) return;
    setValues({}); setError("");
    if (kind === "accounts") getSetupMasterOptions().then(setOptions).catch(e => setError(e.message));
  }, [kind]);
  const field = (key: string, label: string, required = false, maxLength = 255) => <label className="space-y-2 text-sm" key={key}><span>{label}{required ? " *" : ""}</span><Input name={key} aria-label={label} value={values[key] || ""} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} required={required} maxLength={maxLength} /></label>;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!kind) return; setBusy(true); setError("");
    try {
      if (kind === "companies") onCreated(kind, await createSetupMaster(kind, { code: values.code, name: values.name }));
      else onCreated(kind, await createSetupMaster(kind, { ...values, bsisId: Number(values.bsisId), accountTypeId: Number(values.accountTypeId), balanceTypeId: Number(values.balanceTypeId) }));
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create reference."); }
    finally { setBusy(false); }
  }
  return <Dialog open={Boolean(kind)} onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Add {kind === "companies" ? "company" : "GL account"}</DialogTitle><DialogDescription>Save a shared database reference for use in the reconciliation.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">{field("code", "Code", true)}{field("name", "Name", true)}</div>
      {kind === "accounts" && <div className="grid gap-4 sm:grid-cols-3">{([['bsisId', 'BS/IS type', options?.bsis], ['accountTypeId', 'Account classification', options?.accountTypes], ['balanceTypeId', 'Normal balance', options?.balanceTypes]] as const).map(([key, label, items]) => <label key={key} className="space-y-2 text-sm"><span>{label}</span><select aria-label={label} required className="h-9 w-full rounded-md border bg-background px-2" value={values[key] || ""} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}><option value="">Select…</option>{items?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}</div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save reference"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
