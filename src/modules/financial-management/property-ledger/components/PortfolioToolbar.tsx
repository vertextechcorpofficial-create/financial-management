"use client";
import { useState } from "react";
import { ChevronDown, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Asset, Portfolio } from "../types";
import { usePropertyLedgerContext } from "../providers/PropertyLedgerProvider";
import { selectClass } from "./AssetDialog";
import { formatMonth } from "../utils/dates";

function AssetPicker({ kind, assets, onOpen }: { kind: Asset["kind"]; assets: Asset[]; onOpen: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" aria-label={kind === "land" ? "Browse land" : "Browse buildings"}><span className={kind === "land" ? "size-2 rounded-sm bg-warning" : "size-2 rounded-sm bg-primary"} />{kind === "land" ? "Land" : "Buildings"}<span className="text-xs text-muted-foreground">{assets.length}</span><ChevronDown className="size-3" /></Button></PopoverTrigger><PopoverContent align="start" className="w-80 p-2">
    <Input aria-label={kind === "land" ? "Search land" : "Search buildings"} placeholder={`Search ${kind === "land" ? "land" : "buildings"}`} value={search} onChange={e => setSearch(e.target.value)} />
    <div className="my-2 max-h-64 space-y-1 overflow-auto">{assets.filter(a => `${a.name} ${a.location}`.toLowerCase().includes(search.toLowerCase())).map(asset => <button key={asset.id} className="block w-full rounded-md p-2 text-left text-sm hover:bg-accent" onClick={() => { onOpen(asset.id); setOpen(false); }}><span className="block font-medium">{asset.name}</span><span className="text-xs text-muted-foreground">{asset.location || `Acquired ${formatMonth(asset.acquired)}`}</span></button>)}{!assets.length && <p className="p-3 text-sm text-muted-foreground">No properties registered.</p>}</div>
  </PopoverContent></Popover>;
}
export function PortfolioToolbar({ portfolio, assets, onOpen, onExport, exporting, showAssetPickers = false, readOnly = false }: { portfolio: Portfolio; assets: Asset[]; onOpen: (id: string) => void; onExport: (kind: "xlsx" | "pdf") => void; exporting: boolean; showAssetPickers?: boolean; readOnly?: boolean }) {
  const { entity, setEntity, tag, setTag, saving, loading, refresh, save, state } = usePropertyLedgerContext();
  return <nav aria-label="Portfolio navigation" className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 shadow-sm">
     {showAssetPickers && <><AssetPicker kind="land" assets={assets.filter(a => a.kind === "land")} onOpen={onOpen} />
     <AssetPicker kind="building" assets={assets.filter(a => a.kind === "building")} onOpen={onOpen} /></>}
    <div className="flex-1" />
    <select aria-label="Entity" className={cn(selectClass, "w-auto max-w-52")} value={entity} onChange={e => setEntity(e.target.value)}><option value="">{portfolio.entities.length > 1 ? "All entities (consolidated)" : portfolio.entities[0].name}</option>{portfolio.entities.length > 1 && portfolio.entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
    <select aria-label="Group filter" className={cn(selectClass, "w-auto max-w-44")} value={tag} onChange={e => setTag(e.target.value)}><option value="">All groups</option>{[...new Set(portfolio.assets.flatMap(a => a.tags))].sort().map(t => <option key={t} value={t}>Group: {t}</option>)}</select>
     <select aria-label="Currency" className={cn(selectClass, "w-24 shrink-0")} value={portfolio.policies.currency} disabled={readOnly || saving || !state?.canManage} onChange={e => { void save({ ...portfolio, policies: { ...portfolio.policies, currency: e.target.value as Portfolio["policies"]["currency"] } }); }}>{["PHP", "USD", "EUR", "JPY", "GBP"].map(c => <option key={c}>{c}</option>)}</select>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={exporting}><Download className="size-4" />Export<ChevronDown className="size-3" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onExport("xlsx")}>Excel workbook (.xlsx)</DropdownMenuItem><DropdownMenuItem onSelect={() => onExport("pdf")}>Portfolio report (PDF)</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <Button variant="ghost" size="icon" aria-label="Refresh property ledger" disabled={saving || loading} onClick={refresh}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /></Button>
  </nav>;
}
