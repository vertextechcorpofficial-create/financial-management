"use client";
import { cloneElement, createContext, isValidElement, useContext, useId, useState } from "react";
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
import { formatMonth, todayMonth } from "../utils/dates";
import { registrationSchema } from "../utils/registration";
export { todayMonth } from "../utils/dates";

const ValidationContext = createContext<Record<string, string>>({});
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const generatedId = useId();
  const errors = useContext(ValidationContext);
  const control = isValidElement<{ id?: string; name?: string; required?: boolean; "aria-invalid"?: boolean; "aria-describedby"?: string }>(children) ? children : null;
  const controlId = control?.props.id || generatedId;
  const error = errors[control?.props.name ?? ""];
  return <div className="grid min-w-0 content-start gap-2 text-sm font-medium">
    <Label htmlFor={controlId}>{label}{control?.props.required && <span className="text-destructive" aria-hidden="true">*</span>}</Label>
    {control ? cloneElement(control, { id: controlId, "aria-invalid": !!error, "aria-describedby": error ? `${controlId}-error` : undefined }) : children}
    {error && <p id={`${controlId}-error`} className="text-xs text-destructive">{error}</p>}
  </div>;
}
export const selectClass = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-ring disabled:opacity-50 aria-invalid:border-destructive";
export function newAsset(kind: Asset["kind"], entityId: string): Asset {
  return { id: newLedgerId(), version: 1, kind, name: "", entityId, landId: "", location: "", tags: [], acquired: todayMonth(), cost: 0, rate: 5, growth: "compound", method: "sl", parts: kind === "building" ? [{ id: newLedgerId(), name: "Whole building", cost: 0, life: 25, salvage: 10, date: todayMonth() }] : [], events: [], sale: null, notes: "", details: {} };
}
const numericValue = (value: number) => Number.isFinite(value) ? value : "";
const requiredDetailKeys = ["area", "floorArea", "storeys", "yearBuilt"];

export function AssetDialog({ initial, portfolio, saving, onClose, onSave }: { initial: Asset; portfolio: Portfolio; saving: boolean; onClose: () => void; onSave: (asset: Asset) => Promise<boolean> }) {
  const [asset, setAsset] = useState<Asset>(structuredClone(initial));
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const { confirm, confirmation } = useConfirmation();
  const existing = portfolio.assets.some(a => a.id === asset.id);
  const locked = existing && !!portfolio.policies.lockThrough && initial.acquired <= portfolio.policies.lockThrough;
  const closedAcquisition = !!portfolio.policies.lockThrough && asset.acquired <= portfolio.policies.lockThrough;
  const update = <K extends keyof Asset>(key: K, value: Asset[K]) => setAsset(a => ({ ...a, [key]: value }));
  const updatePart = (id: string, patch: Partial<Part>) => update("parts", asset.parts.map(p => p.id === id ? { ...p, ...patch } : p));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const normalizedTags = [...new Map(tags.split(/[,;]/).map(t => t.trim()).filter(Boolean).map(t => [t.toLowerCase(), t])).values()];
    const value = { ...asset, tags: normalizedTags, cost: asset.kind === "building" ? asset.parts.filter(p => p.date === asset.acquired).reduce((s, p) => s + p.cost, 0) : asset.cost };
    const result = registrationSchema.safeParse(value);
    const nextErrors: Record<string, string> = {};
    if (!result.success) for (const issue of result.error.issues) nextErrors[issue.path.join(".")] ??= issue.message;
    for (const element of Array.from(form.elements)) {
      if ((element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) && !element.validity.valid)
        nextErrors[element.name] = element.validity.valueMissing ? "This field is required." : element.validationMessage;
    }
    if (!portfolio.entities.some(entity => entity.id === asset.entityId)) nextErrors.entityId = "Select an accessible company.";
    setErrors(nextErrors);
    setSaveError("");
    if (Object.keys(nextErrors).length) {
      setSaveError("Please correct the highlighted fields before saving.");
      const first = form.elements.namedItem(Object.keys(nextErrors)[0]);
      if (first instanceof HTMLElement) first.focus();
      return;
    }
    if (result.success && await onSave(result.data)) onClose();
    else setSaveError("Property was not saved. Review the notification and try again.");
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl" onInteractOutside={e => e.preventDefault()}>
      <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12"><DialogTitle>{existing ? "Edit" : "Register"} {asset.kind}</DialogTitle><DialogDescription>{locked ? "Descriptive edits are allowed. Unlock the books before changing closed-period accounting facts." : "Record the acquisition and component details. Fields marked * are required."}</DialogDescription></DialogHeader>
      <ValidationContext.Provider value={errors}><form noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
        <div className="max-h-[75vh] min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <fieldset disabled={saving} className="space-y-5 disabled:opacity-70">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Property name"><Input name="name" required maxLength={120} value={asset.name} onChange={e => update("name", e.target.value)} /></Field>
              <Field label="Entity"><select name="entityId" required className={selectClass} value={asset.entityId} onChange={e => setAsset(a => ({ ...a, entityId: e.target.value, landId: "" }))}><option value="">Select company…</option>{portfolio.entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
              <Field label="Location"><Input name="location" required maxLength={120} value={asset.location} onChange={e => update("location", e.target.value)} /></Field>
              <Field label="Acquired month"><Input name="acquired" required type="month" min="1900-01" max="2199-12" value={asset.acquired} onChange={e => { const acquired = e.target.value; setAsset(a => ({ ...a, acquired, parts: a.parts.map(p => p.date === a.acquired ? { ...p, date: acquired } : p) })); }} /></Field>
              <Field label="Tags (comma separated)"><Input name="tags" value={tags} onChange={e => setTags(e.target.value)} /></Field>
              {asset.kind === "land" ? <>
                <Field label="Acquisition cost"><Input name="cost" required type="number" min={0.01} step="0.01" value={numericValue(asset.cost)} onChange={e => update("cost", e.target.valueAsNumber)} /></Field>
                <Field label="Projected annual growth (%)"><Input name="rate" required type="number" min={-50} max={100} step="0.01" value={numericValue(asset.rate)} onChange={e => update("rate", e.target.valueAsNumber)} /></Field>
                <Field label="Projection method"><select name="growth" required className={selectClass} value={asset.growth} onChange={e => update("growth", e.target.value as Asset["growth"])}><option value="compound">Compound</option><option value="simple">Simple</option></select></Field>
              </> : <>
                <Field label="Linked land"><select name="landId" className={selectClass} value={asset.landId} onChange={e => update("landId", e.target.value)}><option value="">No linked land</option>{portfolio.assets.filter(a => a.kind === "land" && a.entityId === asset.entityId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
                <Field label="Depreciation method"><select name="method" required className={selectClass} value={asset.method} onChange={e => update("method", e.target.value as Asset["method"])}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              </>}
            </div>
            {asset.kind === "building" && <section className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><Label>Components and capital improvements <span className="text-destructive">*</span></Label><Button type="button" variant="outline" size="sm" onClick={async () => {
                if (existing && !await confirm("Replace the original building components? Existing improvements will be kept.")) return;
                const improvements = asset.parts.filter(p => p.date !== asset.acquired || asset.events.some(e => e.improvementId === p.id));
                const total = Math.round(asset.parts.filter(p => !improvements.includes(p)).reduce((s, p) => s + p.cost, 0) * 100);
                if (!total || !Number.isFinite(total)) { toast.error("Enter the total cost on the initial component first"); return; }
                const split = portfolio.policies.componentSplit.map(part => Math.round(total * part.share / 100));
                split[0] += total - split.reduce((sum, cost) => sum + cost, 0);
                update("parts", [...portfolio.policies.componentSplit.map((part, i) => ({ id: newLedgerId(), name: part.name, cost: split[i] / 100, life: part.life, salvage: part.salvage, date: asset.acquired })), ...improvements]);
              }}>Use typical split</Button></div>
              {errors.parts && <p className="text-xs text-destructive">{errors.parts}</p>}
              {asset.parts.map((p, index) => <div key={p.id} className="grid items-start gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_5rem_5rem_minmax(12rem,1.5fr)_2.25rem]">
                <Field label="Name"><Input name={`parts.${index}.name`} required maxLength={120} value={p.name} onChange={e => updatePart(p.id, { name: e.target.value })} /></Field>
                <Field label="Cost"><Input name={`parts.${index}.cost`} required type="number" min={0.01} step="0.01" value={numericValue(p.cost)} onChange={e => updatePart(p.id, { cost: e.target.valueAsNumber })} /></Field>
                <Field label="Life (years)"><Input name={`parts.${index}.life`} required type="number" min={1} max={100} value={numericValue(p.life)} onChange={e => updatePart(p.id, { life: e.target.valueAsNumber })} /></Field>
                <Field label="Salvage (%)"><Input name={`parts.${index}.salvage`} required type="number" min={0} max={100} step="0.01" value={numericValue(p.salvage)} onChange={e => updatePart(p.id, { salvage: e.target.valueAsNumber })} /></Field>
                <Field label="In-service month"><Input name={`parts.${index}.date`} required className="min-w-[12rem]" type="month" min={asset.acquired} max="2199-12" value={p.date} onChange={e => updatePart(p.id, { date: e.target.value })} /></Field>
                <Button type="button" variant="outline" size="icon" className="mt-6" disabled={asset.parts.length === 1} onClick={() => update("parts", asset.parts.filter(x => x.id !== p.id))}><Trash2 className="size-4" /><span className="sr-only">Remove {p.name}</span></Button>
              </div>)}
              <Button type="button" variant="outline" size="sm" disabled={asset.parts.length >= 100} onClick={() => update("parts", [...asset.parts, { id: newLedgerId(), name: "New component", cost: 0, life: 10, salvage: 0, date: asset.acquired }])}><Plus className="size-4" />Add component</Button>
            </section>}
            <section className="space-y-3"><h3 className="text-sm font-semibold">Property details</h3><div className="grid gap-4 sm:grid-cols-2">
              {(asset.kind === "land" ? LAND_DETAILS : BUILDING_DETAILS).map(([key, label]) => <Field key={key} label={label}>{DETAIL_OPTIONS[key]
                ? <select name={`details.${key}`} className={selectClass} value={asset.details[key] ?? ""} onChange={e => update("details", { ...asset.details, [key]: e.target.value })}><option value="">Select…</option>{DETAIL_OPTIONS[key].map(option => <option key={option}>{option}</option>)}</select>
                : <Input name={`details.${key}`} required={requiredDetailKeys.includes(key)} type={requiredDetailKeys.includes(key) ? "number" : "text"} min={key === "yearBuilt" ? 1800 : key === "storeys" ? 1 : 0.000001} max={key === "yearBuilt" ? new Date().getFullYear() + 5 : undefined} step={key === "storeys" || key === "yearBuilt" ? 1 : "any"} maxLength={240} value={asset.details[key] ?? ""} onChange={e => update("details", { ...asset.details, [key]: e.target.value })} />}</Field>)}
            </div></section>
            <Field label="Notes"><Textarea name="notes" maxLength={2000} value={asset.notes} onChange={e => update("notes", e.target.value)} /></Field>
          </fieldset>
          {closedAcquisition && !existing && <p role="alert" className="mt-3 text-sm text-destructive">This acquisition is in a closed period. Choose a month after {formatMonth(portfolio.policies.lockThrough)}, or ask an administrator to unlock the books.</p>}
        </div>
        <div className="shrink-0 border-t bg-background px-6 py-4">{saveError && <p role="alert" className="mb-3 text-sm text-destructive">{saveError}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || (!existing && closedAcquisition)}>{saving ? "Saving…" : "Save property"}</Button></DialogFooter>
        </div>
      </form></ValidationContext.Provider>{confirmation}
    </DialogContent>
  </Dialog>;
}
