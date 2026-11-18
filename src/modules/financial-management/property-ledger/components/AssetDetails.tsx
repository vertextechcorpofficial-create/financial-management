"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DETAIL_LABELS } from "../constants";
import { METHODS, type Asset, type Portfolio } from "../types";
import { snapshot } from "../utils/engine";
import { useConfirmation } from "../hooks/useConfirmation";

export function AssetDetails({ asset, portfolio, month, saving, onClose, onEdit, onEvent, onExport, onSave, onRemove, onRegisterBuilding }: {
  asset: Asset; portfolio: Portfolio; month: string; saving: boolean;
  onClose: () => void; onEdit: () => void; onEvent: () => void; onExport: () => void;
  onSave: (asset: Asset) => Promise<boolean>; onRemove: () => void; onRegisterBuilding: () => void;
}) {
  const { confirm, confirmation } = useConfirmation();
  const value = snapshot(asset, portfolio.policies, month);
  const money = (n: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: portfolio.policies.currency, maximumFractionDigits: 0 }).format(n);
  const locked = (date: string) => !!portfolio.policies.lockThrough && date <= portfolio.policies.lockThrough;
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
    <DialogHeader><DialogTitle>{asset.name}</DialogTitle><DialogDescription>{portfolio.entities.find(e => e.id === asset.entityId)?.name} · {asset.location || "No location"} · Acquired {asset.acquired}</DialogDescription></DialogHeader>
    <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={saving} onClick={onEdit}>Edit details</Button><Button variant="outline" size="sm" disabled={saving || !!asset.sale} onClick={onEvent}>Record event</Button><Button variant="outline" size="sm" onClick={onExport}>Asset PDF</Button></div>
    <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">{asset.kind === "land" ? "Market value" : "Book value"} · {month}</p><p className="mt-1 text-xl font-semibold">{money(asset.kind === "land" ? value.market : value.book)}</p></div><div><p className="text-xs text-muted-foreground">Carrying amount</p><p className="mt-1 text-xl font-semibold">{money(value.carrying)}</p></div><div><p className="text-xs text-muted-foreground">Measurement</p><p className="mt-1 text-sm">{asset.kind === "building" ? METHODS[asset.method] : `${asset.rate}% ${asset.growth} growth projection`}</p></div></div>
    <section><h3 className="mb-3 font-semibold">Property details</h3><div className="grid gap-3 sm:grid-cols-3">{Object.entries(asset.details).filter(([, v]) => v).map(([key, val]) => <div key={key}><p className="text-xs text-muted-foreground">{DETAIL_LABELS[key] ?? key}</p><p className="text-sm">{val}</p></div>)}</div>{asset.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{asset.notes}</p>}</section>
    {asset.kind === "building" && <section><h3 className="mb-3 font-semibold">Components and improvements</h3><div className="space-y-2">{asset.parts.map(part => <div key={part.id} className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-sm"><span>{part.name} · {part.date}</span><span>{money(part.cost)} · {part.life} years · {part.salvage}% salvage</span></div>)}</div></section>}
    {asset.kind === "land" && <section><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Buildings on this land</h3><Button variant="outline" size="sm" disabled={saving} onClick={onRegisterBuilding}>Register building here</Button></div>{portfolio.assets.filter(a => a.landId === asset.id).map(building => <p className="rounded-md border p-3 text-sm" key={building.id}>{building.name}</p>)}</section>}
    <section><h3 className="mb-3 font-semibold">{asset.kind === "land" ? "Appraisals" : "Impairments, revaluations and repairs"}</h3><div className="space-y-2">{[...asset.events].sort((a, b) => b.date.localeCompare(a.date)).map(event => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><div><span className="font-medium capitalize">{event.kind}</span> · {event.date} · {money(event.amount)}<p className="text-muted-foreground">{event.note} {event.vendor && `· ${event.vendor}`}</p></div><Button variant="outline" size="sm" disabled={saving || locked(event.date)} onClick={async () => { if (await confirm("Remove this event? Its original revision remains in history.")) await onSave({ ...asset, events: asset.events.filter(e => e.id !== event.id) }); }}>Remove event</Button></div>)}{!asset.events.length && <p className="text-sm text-muted-foreground">No events recorded.</p>}</div></section>
    {asset.sale ? <Alert><AlertTitle>Disposed {asset.sale.date}</AlertTitle><AlertDescription><p>Proceeds {money(asset.sale.price)} · Gain / loss {money(snapshot(asset, portfolio.policies, asset.sale.date).gain)}</p><p>{asset.sale.note}</p><Button className="mt-2" size="sm" variant="outline" disabled={saving || locked(asset.sale.date)} onClick={async () => { if (await confirm("Undo this disposal?")) await onSave({ ...asset, sale: null }); }}>Undo disposal</Button></AlertDescription></Alert> : <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div><h3 className="font-semibold">Sale / disposal</h3><p className="text-sm text-muted-foreground">Not sold. A disposal stops further depreciation or appreciation.</p></div><Button variant="outline" size="sm" onClick={onEvent}>Record sale or event</Button></section>}
    <Button variant="destructive" className="w-fit" disabled={saving || locked(asset.acquired)} onClick={onRemove}>Remove registration</Button>
    {confirmation}
  </DialogContent></Dialog>;
}
