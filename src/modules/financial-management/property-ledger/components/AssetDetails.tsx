"use client";
import { useState } from "react";
import NextLink from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DETAIL_LABELS } from "../constants";
import { METHODS, type Asset, type LedgerEvent, type Part, type Portfolio } from "../types";
import { EventDialog } from "./EventDialog";
import { SaleDialog } from "./SaleDialog";
import { AssetValueChart } from "./AssetValueChart";
import { appraisalBefore, assetSeries, bookBefore, monthIndex, monthString, round, snapshot } from "../utils/engine";
import { formatMonth } from "../utils/dates";
import { formatMoney } from "../utils/format";
import { ledgerPath } from "../navigation";
import { useConfirmation } from "../hooks/useConfirmation";

export function AssetDetails({ asset, portfolio, month, through, saving, readOnly, canRegisterBuilding, onClose, onEdit, onExport, onSave, onRemove, onSavePortfolio, onDuplicate, onOpen }: {
  asset: Asset; portfolio: Portfolio; month: string; through: string; saving: boolean; readOnly?: boolean; canRegisterBuilding: boolean;
  onClose: () => void; onEdit: () => void; onExport: () => void; onOpen: (id: string) => void;
  onSave: (asset: Asset) => Promise<boolean>; onRemove: () => void;
  onSavePortfolio: (portfolio: Portfolio) => Promise<boolean>; onDuplicate: () => void;
}) {
  const { confirm, confirmation } = useConfirmation();
  const [editingEvent, setEditingEvent] = useState<LedgerEvent>();
  const [editingPart, setEditingPart] = useState<Part>();
  const [creating, setCreating] = useState<LedgerEvent["kind"] | "improvement">();
  const [tab, setTab] = useState("overview");
  const [editingSale, setEditingSale] = useState(false);
  const value = snapshot(asset, portfolio.policies, month);
  const money = (n: number) => formatMoney(n, portfolio.policies.currency);
  const locked = (date: string) => !!portfolio.policies.lockThrough && date <= portfolio.policies.lockThrough;
  const canEdit = !readOnly;
  const building = asset.kind === "building";
  const tabs = building ? [["overview", "Overview"], ["parts", "Components & improvements"], ["impairment", "Impairments"], ["revaluation", "Revaluations"], ["repair", "Repairs & maintenance"], ["sale", "Sale / disposal"]]
    : [["overview", "Overview"], ["appraisal", "Appraisals"], ["sale", "Buildings & sale"]];
  const balances = new Map<string, { book: number; accumulated: number }>();
  assetSeries(asset, portfolio.policies, asset.sale && asset.sale.date <= month ? monthString(monthIndex(asset.sale.date) - 1) : month, balances);
  const saleValue = asset.sale ? snapshot(asset, portfolio.policies, asset.sale.date) : null;
  const createButton = (kind: NonNullable<typeof creating>, label: string) => canEdit && <Button size="sm" variant="outline" disabled={saving || !!asset.sale || (kind === "revaluation" && portfolio.policies.buildingModel !== "reval")} onClick={() => setCreating(kind)}>{label}</Button>;
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
    <DialogHeader><DialogTitle>{asset.name}</DialogTitle><DialogDescription>{portfolio.entities.find(e => e.id === asset.entityId)?.name} · {asset.location || "No location recorded"} · Acquired {formatMonth(asset.acquired)}</DialogDescription></DialogHeader>
    <div className="flex flex-wrap gap-2">
      {canEdit && <><Button variant="outline" size="sm" disabled={saving} onClick={onEdit}>Edit details</Button><Button variant="outline" size="sm" disabled={saving || locked(asset.acquired)} onClick={onDuplicate}>Duplicate</Button><Button variant="destructive" size="sm" disabled={saving || locked(asset.acquired)} onClick={onRemove}>Remove registration</Button></>}
      <Button variant="outline" size="sm" onClick={onExport}>Asset PDF</Button>
    </div>
    <nav className="flex flex-wrap gap-1 border-b pb-2" aria-label="Asset sections">{tabs.map(([key, title]) => <Button key={key} size="sm" variant={tab === key ? "default" : "ghost"} aria-pressed={tab === key} onClick={() => setTab(key)}>{title}</Button>)}</nav>
    <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
      <div><p className="text-xs text-muted-foreground">{building ? "Book value" : "Market value"} · {formatMonth(month)}</p><p className="mt-1 text-xl font-semibold">{money(building ? value.book : value.market)}</p></div>
      <div><p className="text-xs text-muted-foreground">Carrying amount</p><p className="mt-1 text-xl font-semibold">{money(value.carrying)}</p></div>
      <div><p className="text-xs text-muted-foreground">Measurement</p><p className="mt-1 text-sm">{building ? METHODS[asset.method] : `${asset.rate}% ${asset.growth} projection`}</p></div>
    </div>
    {tab === "overview" && <section className="space-y-4">
      <h3 className="font-semibold">Property details</h3>
      <div className="grid gap-3 sm:grid-cols-3">{Object.entries(asset.details).filter(([, v]) => v).map(([key, val]) => <div key={key}><p className="text-xs text-muted-foreground">{DETAIL_LABELS[key] ?? key}</p><p className="text-sm">{val}</p></div>)}</div>
      {!Object.values(asset.details).some(Boolean) && <p className="text-sm text-muted-foreground">No optional property details recorded.</p>}
      {asset.notes && <p className="whitespace-pre-wrap text-sm">{asset.notes}</p>}
      {!building && value.status === "Held" && asset.cost > 0 && month > asset.acquired && <p className="text-sm">Annualized growth since acquisition: {((Math.pow(value.market / asset.cost, 12 / (monthIndex(month) - monthIndex(asset.acquired))) - 1) * 100).toFixed(2)}%</p>}
      <AssetValueChart asset={asset} portfolio={portfolio} month={month} through={through} />
    </section>}
    {tab === "parts" && <section className="space-y-3">
      <div className="flex justify-between gap-2"><h3 className="font-semibold">Components & improvements</h3>{createButton("improvement", "Add improvement")}</div>
      {asset.parts.map(part => { const balance = balances.get(part.id); const improvement = part.date > asset.acquired || asset.events.some(e => e.improvementId === part.id); return <div key={part.id} className="space-y-2 rounded-md border p-3 text-sm">
        <p className="font-medium">{part.name} · {improvement ? "Improvement" : "Component"}</p><p>{formatMonth(part.date)} · Cost {money(part.cost)} · {part.life} years · {part.salvage}% salvage</p>
        <p>Accumulated depreciation {money(balance?.accumulated ?? 0)} · Book value {money(balance?.book ?? 0)}</p>
        {canEdit && improvement && !asset.events.some(e => e.improvementId === part.id) && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={saving || locked(part.date)} onClick={() => setEditingPart(part)}>Edit improvement</Button><Button size="sm" variant="outline" disabled={saving || locked(part.date)} onClick={async () => { if (await confirm("Remove this improvement?")) await onSave({ ...asset, parts: asset.parts.filter(p => p.id !== part.id) }); }}>Remove improvement</Button></div>}
      </div>; })}
    </section>}
    {["appraisal", "impairment", "revaluation", "repair"].includes(tab) && <section className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{tabs.find(([key]) => key === tab)?.[1]}</h3>{createButton(tab as LedgerEvent["kind"], `Record ${tab}`)}</div>
      {tab === "revaluation" && portfolio.policies.buildingModel !== "reval" && <p className="text-sm text-muted-foreground">Switch buildings to the revaluation model in Accounting policies to record revaluations. Existing records remain visible.</p>}
      {tab === "repair" && <p className="text-sm">Capitalization threshold: {money(portfolio.policies.capThreshold)}</p>}
      {asset.events.filter(e => e.kind === tab).sort((a, b) => a.date.localeCompare(b.date)).map(event => <div key={event.id} className="space-y-2 rounded-md border p-3 text-sm">
        <p>{formatMonth(event.date)} · {money(event.amount)}{event.kind === "repair" && ` · ${event.improvementId ? "Capitalized" : "Expensed"}`}</p>
        {event.kind === "appraisal" && <p>Estimate before: {money(appraisalBefore(asset, portfolio.policies, event.date))} · Appraisal difference: {money(round(event.amount - appraisalBefore(asset, portfolio.policies, event.date)))}</p>}
        {["impairment", "revaluation"].includes(event.kind) && <p>Book value before: {money(bookBefore(asset, portfolio.policies, event.date))}</p>}
        <p>{event.note}{event.vendor && ` · ${event.vendor}`}</p>
        {canEdit && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={saving || locked(event.date) || (event.kind === "revaluation" && portfolio.policies.buildingModel !== "reval")} onClick={() => setEditingEvent(event)}>Edit {event.kind}</Button><Button size="sm" variant="outline" disabled={saving || locked(event.date)} onClick={async () => { if (await confirm(`Remove this ${event.kind}?`)) await onSave({ ...asset, events: asset.events.filter(e => e.id !== event.id), parts: asset.parts.filter(p => p.id !== event.improvementId) }); }}>Remove {event.kind}</Button></div>}
      </div>)}
      {!asset.events.some(e => e.kind === tab) && <p className="text-sm text-muted-foreground">None recorded.</p>}
    </section>}
    {tab === "sale" && <section className="space-y-4">
      {!building && <><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Buildings on this land</h3>{canRegisterBuilding && <Button asChild size="sm" variant="outline"><NextLink prefetch={false} href={`${ledgerPath("building-register")}?landId=${encodeURIComponent(asset.id)}`}>Register building on this land</NextLink></Button>}</div>
        {portfolio.assets.filter(a => a.kind === "building" && a.landId === asset.id).map(b => <button key={b.id} className="block w-full rounded-md border p-3 text-left text-sm hover:bg-accent" onClick={() => onOpen(b.id)}>{b.name} · In service {formatMonth(b.acquired)} · Book value {money(snapshot(b, portfolio.policies, month).book)} · {snapshot(b, portfolio.policies, month).status}</button>)}
        {!portfolio.assets.some(a => a.landId === asset.id) && <p className="text-sm">No buildings linked.</p>}</>}
      <h3 className="font-semibold">Sale / disposal</h3>
      {asset.sale && saleValue ? <><p className="text-sm">Sold {formatMonth(asset.sale.date)} · Proceeds {money(asset.sale.price)} − carrying amount {money(round(asset.sale.price - saleValue.gain))} = gain / loss {money(saleValue.gain)}</p><p className="text-sm">{asset.sale.note}</p></> : <p className="text-sm">Not sold. A disposal stops further depreciation or appreciation.</p>}
      {canEdit && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={saving || (!!asset.sale && locked(asset.sale.date))} onClick={() => setEditingSale(true)}>{asset.sale ? "Edit sale" : "Record sale"}</Button>{asset.sale && <Button size="sm" variant="outline" disabled={saving || locked(asset.sale.date)} onClick={async () => { if (await confirm("Undo this disposal? Linked building sales are retained.")) await onSave({ ...asset, sale: null }); }}>Undo sale</Button>}</div>}
    </section>}
    {canEdit && editingSale && <SaleDialog asset={asset} portfolio={portfolio} saving={saving} onSave={onSavePortfolio} onClose={() => setEditingSale(false)} />}
    {canEdit && (creating || editingEvent || editingPart) && <EventDialog key={editingEvent?.id ?? editingPart?.id ?? creating} asset={asset} existing={editingEvent} existingPart={editingPart} initialKind={creating} policies={portfolio.policies} saving={saving} onSave={onSave} onClose={() => { setCreating(undefined); setEditingEvent(undefined); setEditingPart(undefined); }} />}
    {confirmation}
  </DialogContent></Dialog>;
}
