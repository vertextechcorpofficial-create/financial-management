"use client";
import { cloneElement, isValidElement, useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { METHODS, type Asset, type Part, type Portfolio } from "../types";
import { useConfirmation } from "../hooks/useConfirmation";
import { LAND_DETAILS, BUILDING_DETAILS, DETAIL_OPTIONS } from "../constants";
import { newLedgerId } from "../utils/id";
import { todayMonth } from "../utils/dates";
export { todayMonth } from "../utils/dates";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const generatedId = useId();
  const control = isValidElement<{ id?: string }>(children) ? children : null;
  const controlId = control?.props.id || generatedId;
  return <div className="grid gap-2 text-sm font-medium">
    <Label htmlFor={controlId}>{label}</Label>
    {control ? cloneElement(control, { id: controlId }) : children}
  </div>;
}
export const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-ring disabled:opacity-50";
export function newAsset(kind: Asset["kind"], entityId: string): Asset {
  return { id: newLedgerId(), version: 1, kind, name: "", entityId, landId: "", location: "", tags: [], acquired: todayMonth(), cost: 0, rate: 5, growth: "compound", method: "sl", parts: kind === "building" ? [{ id: newLedgerId(), name: "Whole building", cost: 0, life: 25, salvage: 10, date: todayMonth() }] : [], events: [], sale: null, notes: "", details: {} };
}

export function AssetDialog({ initial, portfolio, saving, onClose, onSave }: { initial: Asset; portfolio: Portfolio; saving: boolean; onClose: () => void; onSave: (asset: Asset) => Promise<boolean> }) {
  const [asset, setAsset] = useState<Asset>(structuredClone(initial));
  const [tags, setTags] = useState(initial.tags.join(", "));
  const { confirm, confirmation } = useConfirmation();
  const existing = portfolio.assets.some(a => a.id === asset.id);
  const locked = existing && !!portfolio.policies.lockThrough && initial.acquired <= portfolio.policies.lockThrough;
  const closedAcquisition = !!portfolio.policies.lockThrough && asset.acquired <= portfolio.policies.lockThrough;
  const update = <K extends keyof Asset>(key: K, value: Asset[K]) => setAsset(a => ({ ...a, [key]: value }));
  const updatePart = (id: string, patch: Partial<Part>) => update("parts", asset.parts.map(p => p.id === id ? { ...p, ...patch } : p));
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl" onInteractOutside={e => e.preventDefault()}>
    <DialogHeader><DialogTitle>{existing ? "Edit" : "Register"} {asset.kind}</DialogTitle><DialogDescription>{locked ? "Descriptive edits are allowed. Unlock the books before changing closed-period accounting facts." : "Record the acquisition and component details. Changes are saved to the shared property ledger."}</DialogDescription></DialogHeader>
    <form className="space-y-5" onSubmit={async e => { e.preventDefault(); const normalizedTags = [...new Map(tags.split(/[,;]/).map(t => t.trim()).filter(Boolean).map(t => [t.toLowerCase(), t])).values()]; const value = { ...asset, tags: normalizedTags, cost: asset.kind === "building" ? asset.parts.filter(p => p.date === asset.acquired).reduce((s, p) => s + p.cost, 0) : asset.cost }; if (await onSave(value)) onClose(); }}>
      <fieldset disabled={saving} className="space-y-5 disabled:opacity-70">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Property name"><Input required maxLength={120} value={asset.name} onChange={e => update("name", e.target.value)} /></Field><Field label="Entity"><select className={selectClass} value={asset.entityId} onChange={e => { setAsset(a => ({ ...a, entityId: e.target.value, landId: "" })); }}>{portfolio.entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field><Field label="Location"><Input maxLength={240} value={asset.location} onChange={e => update("location", e.target.value)} /></Field><Field label="Acquired month"><Input required type="month" min="1900-01" max="2199-12" value={asset.acquired} onChange={e => { const acquired = e.target.value; setAsset(a => ({ ...a, acquired, parts: a.parts.map(p => p.date === a.acquired ? { ...p, date: acquired } : p) })); }} /></Field><Field label="Tags (comma separated)"><Input value={tags} onChange={e => setTags(e.target.value)} /></Field>
          {asset.kind === "land" ? <><Field label="Acquisition cost"><Input required type="number" min={0} step="0.01" value={asset.cost} onChange={e => update("cost", Number(e.target.value))} /></Field><Field label="Projected annual growth (%)"><Input required type="number" min={-50} max={100} step="0.01" value={asset.rate} onChange={e => update("rate", Number(e.target.value))} /></Field><Field label="Projection method"><select className={selectClass} value={asset.growth} onChange={e => update("growth", e.target.value as Asset["growth"])}><option value="compound">Compound</option><option value="simple">Simple</option></select></Field></> : <><Field label="Linked land"><select className={selectClass} value={asset.landId} onChange={e => update("landId", e.target.value)}><option value="">No linked land</option>{portfolio.assets.filter(a => a.kind === "land" && a.entityId === asset.entityId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field><Field label="Depreciation method"><select className={selectClass} value={asset.method} onChange={e => update("method", e.target.value as Asset["method"])}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field></>}
        </div>
        {asset.kind === "building" && <section className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><Label>Components and capital improvements</Label><Button type="button" variant="outline" size="sm" onClick={async () => {
          if (existing && !await confirm("Replace the original building components? Existing improvements will be kept.")) return;
          const improvements = asset.parts.filter(p => p.date !== asset.acquired || asset.events.some(e => e.improvementId === p.id));
          const total = Math.round(asset.parts.filter(p => !improvements.includes(p)).reduce((s, p) => s + p.cost, 0) * 100);
          if (!total) { toast.error("Enter the total cost on the initial component first"); return; }
          const split = portfolio.policies.componentSplit.map(part => Math.round(total * part.share / 100));
          split[0] += total - split.reduce((sum, cost) => sum + cost, 0);
          update("parts", [...portfolio.policies.componentSplit.map((part, i) => ({ id: newLedgerId(), name: part.name, cost: split[i] / 100, life: part.life, salvage: part.salvage, date: asset.acquired })), ...improvements]);
        }}>Use typical split</Button></div>
          {asset.parts.map(p => <div key={p.id} className="grid items-end gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-3 lg:grid-cols-6"><Field label="Name"><Input required value={p.name} onChange={e => updatePart(p.id, { name: e.target.value })} /></Field><Field label="Cost"><Input required type="number" min={0} step="0.01" value={p.cost} onChange={e => updatePart(p.id, { cost: Number(e.target.value) })} /></Field><Field label="Life (years)"><Input required type="number" min={1} max={100} value={p.life} onChange={e => updatePart(p.id, { life: Number(e.target.value) })} /></Field><Field label="Salvage (%)"><Input required type="number" min={0} max={100} step="0.01" value={p.salvage} onChange={e => updatePart(p.id, { salvage: Number(e.target.value) })} /></Field><Field label="In-service month"><Input required type="month" min={asset.acquired} value={p.date} onChange={e => updatePart(p.id, { date: e.target.value })} /></Field><Button type="button" variant="outline" disabled={asset.parts.length === 1} onClick={() => update("parts", asset.parts.filter(x => x.id !== p.id))}><Trash2 className="size-4" /><span className="sr-only">Remove {p.name}</span></Button></div>)}
          <Button type="button" variant="outline" size="sm" onClick={() => update("parts", [...asset.parts, { id: newLedgerId(), name: "New component", cost: 0, life: 10, salvage: 0, date: asset.acquired }])}><Plus className="size-4" />Add component</Button>
        </section>}
         <section className="space-y-3"><h3 className="text-sm font-semibold">Property details</h3><div className="grid gap-4 sm:grid-cols-2">{(asset.kind === "land" ? LAND_DETAILS : BUILDING_DETAILS).map(([key, label]) => <Field key={key} label={label}>{DETAIL_OPTIONS[key] ? <select className={selectClass} value={asset.details[key] ?? ""} onChange={e => update("details", { ...asset.details, [key]: e.target.value })}><option value="">Select…</option>{DETAIL_OPTIONS[key].map(option => <option key={option}>{option}</option>)}</select> : <Input maxLength={240} value={asset.details[key] ?? ""} onChange={e => update("details", { ...asset.details, [key]: e.target.value })} />}</Field>)}</div></section>
         <Field label="Notes"><Textarea maxLength={2000} value={asset.notes} onChange={e => update("notes", e.target.value)} /></Field>
      </fieldset>{closedAcquisition && !existing && <p role="alert" className="text-sm text-destructive">This acquisition is in a closed period. Choose a month after {portfolio.policies.lockThrough}, or ask an administrator to unlock the books.</p>}<DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || (!existing && closedAcquisition)}>{saving ? "Saving…" : "Save property"}</Button></DialogFooter>
    </form>{confirmation}
  </DialogContent></Dialog>;
}
