"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Asset, LedgerEvent, Part, Policies } from "../types";
import { Field, selectClass, todayMonth } from "./AssetDialog";
import { newLedgerId } from "../utils/id";

export function EventDialog({ asset, policies, saving, onSave, onClose, existing, existingPart }: { asset: Asset; policies: Policies; saving: boolean; onSave: (asset: Asset) => Promise<boolean>; onClose: () => void; existing?: LedgerEvent; existingPart?: Part }) {
  const linked = existingPart ?? asset.parts.find(p => p.id === existing?.improvementId);
  const [kind, setKind] = useState<LedgerEvent["kind"] | "improvement" | "sale">(existingPart ? "improvement" : existing?.kind ?? (asset.kind === "land" ? "appraisal" : "repair"));
  const [date, setDate] = useState(existingPart?.date ?? existing?.date ?? todayMonth());
  const [amount, setAmount] = useState(existingPart?.cost ?? existing?.amount ?? 0);
  const [note, setNote] = useState(existingPart?.name ?? existing?.note ?? "");
  const [vendor, setVendor] = useState(existing?.vendor ?? "");
  const [life, setLife] = useState(linked?.life ?? 10);
  const [salvage, setSalvage] = useState(linked?.salvage ?? 0);
  const [capitalizeOverride, setCapitalizeOverride] = useState<boolean | undefined>(existing ? !!linked : undefined);
  const capitalize = capitalizeOverride ?? amount >= policies.capThreshold;
  const oldDate = existingPart?.date ?? existing?.date;
  const locked = !!policies.lockThrough && (date <= policies.lockThrough || (!!oldDate && oldDate <= policies.lockThrough));
  const unavailable = !!asset.sale && (!oldDate || date >= asset.sale.date);
  const options = asset.kind === "land" ? [["appraisal", "Appraisal"]] : [["repair", "Repair / maintenance"], ["improvement", "Capital improvement"], ["impairment", "Impairment"], ...(policies.buildingModel === "reval" ? [["revaluation", "Revaluation"]] : [])];
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent onInteractOutside={e => e.preventDefault()}><DialogHeader><DialogTitle>Record property event</DialogTitle><DialogDescription>{asset.name} · Events apply at the start of the selected month. Disposal stops further depreciation or appreciation.</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault();
      const updated = structuredClone(asset);
      const description = note.trim();
      if ((kind === "repair" || kind === "improvement") && !description) return;
      if (kind === "sale") updated.sale = { date, price: amount, note: description };
      else if (kind === "improvement") {
        const part = { id: existingPart?.id ?? newLedgerId(), name: description, date, cost: amount, life, salvage };
        updated.parts = existingPart ? updated.parts.map(p => p.id === existingPart.id ? part : p) : [...updated.parts, part];
      }
      else {
        const improvementId = kind === "repair" && capitalize ? existing?.improvementId ?? newLedgerId() : undefined;
        if (existing?.improvementId) updated.parts = updated.parts.filter(p => p.id !== existing.improvementId);
        if (improvementId) updated.parts.push({ id: improvementId, name: description.slice(0, 120), date, cost: amount, life, salvage });
        const event = { id: existing?.id ?? newLedgerId(), kind, date, amount, note: description, vendor, improvementId };
        updated.events = existing ? updated.events.map(e => e.id === existing.id ? event : e) : [...updated.events, event];
      }
      if (await onSave(updated)) onClose();
    }}>
      <fieldset disabled={saving} className="space-y-4">{!oldDate && <Field label="Event type"><select className={selectClass} value={kind} onChange={e => setKind(e.target.value as typeof kind)}>{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>}<div className="grid grid-cols-2 gap-3"><Field label="Effective month"><Input required type="month" min={asset.acquired} max="2199-12" value={date} onChange={e => setDate(e.target.value)} /></Field><Field label={kind === "appraisal" || kind === "revaluation" ? "New total value" : kind === "sale" ? "Sale proceeds" : "Amount"}><Input required type="number" min={kind === "repair" || kind === "improvement" || kind === "impairment" ? 0.01 : 0} step="0.01" value={amount} onChange={e => setAmount(Number(e.target.value))} /></Field></div>
        {(kind === "improvement" || (kind === "repair" && capitalize)) && <div className="grid grid-cols-2 gap-3"><Field label="Useful life (years)"><Input required type="number" min={1} max={100} value={life} onChange={e => setLife(Number(e.target.value))} /></Field><Field label="Salvage (%)"><Input required type="number" min={0} max={100} value={salvage} onChange={e => setSalvage(Number(e.target.value))} /></Field></div>}
        {kind === "repair" && <><Field label="Vendor"><Input maxLength={120} value={vendor} onChange={e => setVendor(e.target.value)} /></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={capitalize} onChange={e => setCapitalizeOverride(e.target.checked)} />Capitalize as an improvement</label></>}
        <Field label={kind === "improvement" ? "Improvement name" : kind === "repair" ? "Work description" : "Notes"}><Textarea maxLength={kind === "improvement" ? 120 : 1000} required={kind === "improvement" || kind === "repair"} value={note} onChange={e => setNote(e.target.value)} /></Field>
      </fieldset>{locked && <p role="alert" className="text-sm text-destructive">Books are locked through {policies.lockThrough}.</p>}
       <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || locked || unavailable}>{saving ? "Saving…" : "Save event"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
