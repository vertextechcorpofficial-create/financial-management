"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DETAIL_LABELS } from "../constants";
import { useState } from "react";
import { METHODS, type Asset, type LedgerEvent, type Part, type Portfolio } from "../types";
import { EventDialog } from "./EventDialog";
import { SaleDialog } from "./SaleDialog";
import { monthIndex, snapshot } from "../utils/engine";
import { useConfirmation } from "../hooks/useConfirmation";

export function AssetDetails({ asset, portfolio, month, saving, onClose, onEdit, onEvent, onExport, onSave, onRemove, onRegisterBuilding, onSavePortfolio, onDuplicate }: {
  asset: Asset; portfolio: Portfolio; month: string; saving: boolean;
  onClose: () => void; onEdit: () => void; onEvent: () => void; onExport: () => void;
  onSave: (asset: Asset) => Promise<boolean>; onRemove: () => void; onRegisterBuilding: () => void;
  onSavePortfolio: (portfolio: Portfolio) => Promise<boolean>; onDuplicate: () => void;
}) {
  const { confirm, confirmation } = useConfirmation();
  const [editingEvent, setEditingEvent] = useState<LedgerEvent>();
  const [editingPart, setEditingPart] = useState<Part>();
  const [tab, setTab] = useState<"overview" | "parts" | "events" | "sale">("overview");
  const [editingSale, setEditingSale] = useState(false);
  const value = snapshot(asset, portfolio.policies, month);
  const elapsed = monthIndex(month) - monthIndex(asset.acquired);
  const annualGrowth = asset.kind === "land" && value.status === "Held" && elapsed > 0 && asset.cost > 0
    ? (Math.pow(value.market / asset.cost, 12 / elapsed) - 1) * 100 : null;
  const money = (n: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: portfolio.policies.currency, maximumFractionDigits: 0 }).format(n);
  const locked = (date: string) => !!portfolio.policies.lockThrough && date <= portfolio.policies.lockThrough;
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
    <DialogHeader><DialogTitle>{asset.name}</DialogTitle><DialogDescription>{portfolio.entities.find(e => e.id === asset.entityId)?.name} Â· {asset.location || "No location"} Â· Acquired {asset.acquired}</DialogDescription></DialogHeader>
     <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={saving} onClick={onEdit}>Edit details</Button><Button variant="outline" size="sm" disabled={saving || !!asset.sale} onClick={onEvent}>Record event</Button><Button variant="outline" size="sm" onClick={onExport}>Asset PDF</Button></div>
     <nav className="flex flex-wrap gap-1 border-b pb-2" aria-label="Asset sections">{(["overview", ...(asset.kind === "building" ? ["parts", "events"] : ["events"]), "sale"] as ("overview" | "parts" | "events" | "sale")[]).map(name => <Button key={name} type="button" size="sm" variant={tab === name ? "default" : "ghost"} onClick={() => setTab(name)}>{name === "parts" ? "Components & improvements" : name[0].toUpperCase() + name.slice(1)}</Button>)}</nav>
    <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">{asset.kind === "land" ? "Market value" : "Book value"} Â· {month}</p><p className="mt-1 text-xl font-semibold">{money(asset.kind === "land" ? value.market : value.book)}</p></div><div><p className="text-xs text-muted-foreground">Carrying amount</p><p className="mt-1 text-xl font-semibold">{money(value.carrying)}</p></div><div><p className="text-xs text-muted-foreground">Measurement</p><p className="mt-1 text-sm">{asset.kind === "building" ? METHODS[asset.method] : `${asset.rate}% ${asset.growth} growth projection`}</p></div></div>
    <section hidden={tab !== "overview"}><h3 className="mb-3 font-semibold">Property details</h3><div className="grid gap-3 sm:grid-cols-3">{Object.entries(asset.details).filter(([, v]) => v).map(([key, val]) => <div key={key}><p className="text-xs text-muted-foreground">{DETAIL_LABELS[key] ?? key}</p><p className="text-sm">{val}</p></div>)}</div>{asset.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{asset.notes}</p>}</section>
    {asset.kind === "building" && <section hidden={tab !== "parts"}><h3 className="mb-3 font-semibold">Components and improvements</h3><div className="space-y-2">{asset.parts.map(part => <div key={part.id} className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-sm"><span>{part.name} Â· {part.date}</span><span>{money(part.cost)} Â· {part.life} years Â· {part.salvage}% salvage</span></div>)}</div></section>}
    {asset.kind === "land" && <section hidden={tab !== "overview"}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Buildings on this land</h3><Button variant="outline" size="sm" disabled={saving} onClick={onRegisterBuilding}>Register building here</Button></div>{portfolio.assets.filter(a => a.landId === asset.id).map(building => <p className="rounded-md border p-3 text-sm" key={building.id}>{building.name}</p>)}</section>}
    <section hidden={tab !== "events"}><h3 className="mb-3 font-semibold">{asset.kind === "land" ? "Appraisals" : "Impairments, revaluations and repairs"}</h3><div className="space-y-2">{[...asset.events].sort((a, b) => b.date.localeCompare(a.date)).map(event => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><div><span className="font-medium capitalize">{event.kind}</span> Â· {event.date} Â· {money(event.amount)}{event.improvementId && " Â· Capitalized"}<p className="text-muted-foreground">{event.note} {event.vendor && `Â· ${event.vendor}`}</p></div><Button variant="outline" size="sm" disabled={saving || locked(event.date)} onClick={async () => { if (await confirm("Remove this event? Its original revision remains in history.")) await onSave({ ...asset, events: asset.events.filter(e => e.id !== event.id), parts: asset.parts.filter(p => p.id !== event.improvementId) }); }}>Remove event</Button></div>)}{!asset.events.length && <p className="text-sm text-muted-foreground">No events recorded.</p>}</div></section>
    <div hidden={tab !== "sale"}>{asset.sale ? <Alert><AlertTitle>Disposed {asset.sale.date}</AlertTitle><AlertDescription><p>Proceeds {money(asset.sale.price)} Â· Gain / loss {money(snapshot(asset, portfolio.policies, asset.sale.date).gain)}</p><p>{asset.sale.note}</p><Button className="mt-2" size="sm" variant="outline" disabled={saving || locked(asset.sale.date)} onClick={async () => { if (await confirm("Undo this disposal?")) await onSave({ ...asset, sale: null }); }}>Undo disposal</Button></AlertDescription></Alert> : <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div><h3 className="font-semibold">Sale / disposal</h3><p className="text-sm text-muted-foreground">Not sold. A disposal stops further depreciation or appreciation.</p></div><Button variant="outline" size="sm" onClick={onEvent}>Record sale or event</Button></section>}</div>
    <Button variant="destructive" className="w-fit" disabled={saving || locked(asset.acquired)} onClick={onRemove}>Remove registration</Button>
    <div className="flex gap-2">
      <Button variant="outline" disabled={saving || locked(asset.acquired)} onClick={onDuplicate}>Duplicate</Button>
      <Button variant="outline" disabled={saving || (!!asset.sale && locked(asset.sale.date))} onClick={() => setEditingSale(true)}>{asset.sale ? "Edit sale" : "Record sale"}</Button>
    </div>
    {editingSale && <SaleDialog asset={asset} portfolio={portfolio} saving={saving} onSave={onSavePortfolio} onClose={() => setEditingSale(false)} />}
    {asset.kind === "land" && <section hidden={tab !== "overview"} className="space-y-2 text-sm">
      <h3 className="font-semibold">Land projection analysis</h3>
      <p>Annualized growth since acquisition: {annualGrowth === null ? "â€”" : `${annualGrowth.toFixed(2)}%`}</p>
      {asset.events.filter(e => e.kind === "appraisal").map(appraisal => {
        const prior = snapshot({ ...asset, events: asset.events.filter(e => e.date < appraisal.date) }, portfolio.policies, appraisal.date).market;
        return <p key={appraisal.id}>{appraisal.date}: prior projection {money(prior)} Â· appraisal difference {money(appraisal.amount - prior)}</p>;
      })}
    </section>}
    {asset.events.length > 0 && <label className="flex items-center gap-2 text-sm">
      Edit recorded event
      <select className="rounded border bg-background p-2" value="" disabled={saving} onChange={e => setEditingEvent(asset.events.find(event => event.id === e.target.value))}>
        <option value="">Select event</option>
        {asset.events.map(event => <option key={event.id} disabled={locked(event.date) || (event.kind === "revaluation" && portfolio.policies.buildingModel !== "reval")} value={event.id}>{event.date} Â· {event.kind} Â· {event.note}</option>)}
      </select>
    </label>}
    {editingEvent && <EventDialog key={editingEvent.id} asset={asset} existing={editingEvent} policies={portfolio.policies} saving={saving} onSave={onSave} onClose={() => setEditingEvent(undefined)} />}
    {asset.kind === "building" && asset.parts.filter(p => p.date > asset.acquired && !asset.events.some(e => e.improvementId === p.id)).map(p => <div key={p.id} className="flex flex-wrap items-center gap-2">
      <span className="text-sm">{p.name} Â· {p.date}</span>
      <Button variant="outline" size="sm" disabled={saving || locked(p.date)} onClick={() => setEditingPart(p)}>Edit improvement</Button>
      <Button variant="outline" size="sm" disabled={saving || locked(p.date) || asset.parts.length === 1} onClick={async () => {
        if (await confirm("Remove this improvement?")) await onSave({ ...asset, parts: asset.parts.filter(part => part.id !== p.id) });
      }}>Remove improvement</Button>
    </div>)}
    {editingPart && <EventDialog key={editingPart.id} asset={asset} existingPart={editingPart} policies={portfolio.policies} saving={saving} onSave={onSave} onClose={() => setEditingPart(undefined)} />}
    {confirmation}
  </DialogContent></Dialog>;
}
