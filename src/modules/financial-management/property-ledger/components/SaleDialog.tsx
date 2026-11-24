"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Asset, Portfolio } from "../types";
import { saveSale } from "../utils/sales";
import { Field, todayMonth } from "./AssetDialog";

export function SaleDialog({ asset, portfolio, saving, onSave, onClose }: {
  asset: Asset; portfolio: Portfolio; saving: boolean; onSave: (portfolio: Portfolio) => Promise<boolean>; onClose: () => void;
}) {
  const [date, setDate] = useState(asset.sale?.date ?? todayMonth());
  const [price, setPrice] = useState(asset.sale ? String(asset.sale.price) : "");
  const [note, setNote] = useState(asset.sale?.note ?? "");
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const buildings = asset.kind === "land" ? portfolio.assets.filter(a => a.kind === "building" && a.landId === asset.id && !a.sale && a.acquired <= date) : [];
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{asset.sale ? "Edit sale" : "Record sale"} · {asset.name}</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault();
        setError("");
        try {
          const allocations = Object.fromEntries(buildings.filter(b => !excluded[b.id]).map(b => [b.id, Number(prices[b.id] || 0)]));
          if (await onSave(saveSale(portfolio, asset, { date, price: Number(price), note: note.trim() }, allocations))) onClose();
        } catch (e) { setError(e instanceof Error ? e.message : "Sale could not be recorded."); }
      }}>
        <Field label="Sale month"><Input required type="month" min={asset.acquired} value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Sale price"><Input required type="number" min={0} step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></Field>
        <Field label="Buyer or note"><Input maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></Field>
        {buildings.map(b => <div key={b.id} className="flex items-center gap-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!excluded[b.id]} onChange={e => setExcluded({ ...excluded, [b.id]: !e.target.checked })} />{b.name}</label>
          <Input aria-label={`Sale price for ${b.name}`} type="number" min={0} step="0.01" placeholder="0" disabled={excluded[b.id]} value={prices[b.id] ?? ""} onChange={e => setPrices({ ...prices, [b.id]: e.target.value })} />
        </div>)}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={saving}>Save sale</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
