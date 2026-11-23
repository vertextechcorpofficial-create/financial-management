"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Upload } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirmation } from "./hooks/useConfirmation";
import { METHODS, type Asset, type HistoryEntry } from "./types";
import { LEDGER_PAGES, ledgerPath, type LedgerPage } from "./navigation";
import { assetSeries, monthIndex, monthString, portfolioSeries, schedule, snapshot, type Snapshot } from "./utils/engine";
import { fiscalDepreciation, heldValue, reportRows, reviewFlags, type ScheduleRow } from "./utils/reporting";
import { exportExcel, exportPdf } from "./utils/exports";
import { copyText } from "./utils/clipboard";
import { AssetDialog, Field, newAsset, selectClass } from "./components/AssetDialog";
import { AssetDetails } from "./components/AssetDetails";
import { EventDialog } from "./components/EventDialog";
import { PoliciesPanel } from "./components/PoliciesPanel";
import { ImportDialog } from "./components/ImportDialog";
import { newLedgerId as duplicateId } from "./utils/id";
import { LedgerTable } from "./components/LedgerTable";
import { PortfolioToolbar } from "./components/PortfolioToolbar";
import { MetricGrid, ValuationControls } from "./components/ReportPrimitives";
import { usePropertyLedgerContext } from "./providers/PropertyLedgerProvider";

const flowKeys = ["additions", "depreciation", "impairment", "appreciation", "revaluation", "repairs", "proceeds", "gain", "buildingDisposals", "landDisposals", "disposals"] as const;
function fiscalYear(month: string, start: number) { return Math.floor((monthIndex(month) - start + 1) / 12) + (start === 1 ? 0 : 1); }
function fiscalStart(year: number, start: number) { return monthString((year - (start === 1 ? 0 : 1)) * 12 + start - 1); }
const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function PropertyLedgerModule({ view = "dashboard" }: { view?: LedgerPage }) {
  const { state, loading, saving, error, refresh, save, month, through, entity, tag, setTag } = usePropertyLedgerContext();
  const { confirm, confirmation } = useConfirmation();
  const [query, setQuery] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [granularity, setGranularity] = useState<"monthly" | "quarterly" | "annual">("annual");
  const [scheduleAsset, setScheduleAsset] = useState("");
  const [fromYear, setFromYear] = useState<number | null>(null);
  const [toYear, setToYear] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<"totals" | "asset">("totals");
  const [editing, setEditing] = useState<Asset | null>(null);
  const [eventAsset, setEventAsset] = useState<Asset | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const portfolio = state?.portfolio;
  const filtered = useMemo(() => portfolio ? { ...portfolio, assets: portfolio.assets.filter(a => (!entity || a.entityId === entity) && (!tag || a.tags.includes(tag))) } : null, [portfolio, entity, tag]);
  const kind = view === "building-depreciation" ? "building" : view === "land-appreciation" ? "land" : "all";
  const earliest = filtered?.assets.map(a => a.acquired).sort()[0] ?? month;
  const startYear = fiscalYear(earliest, portfolio?.policies.fyStart ?? 1);
  const endYear = Math.max(startYear, fiscalYear(through, portfolio?.policies.fyStart ?? 1));
  const firstYear = Math.max(startYear, Math.min(fromYear ?? startYear, endYear));
  const lastYear = Math.max(firstYear, Math.min(toYear ?? endYear, endYear));
  const from = fiscalStart(firstYear, portfolio?.policies.fyStart ?? 1);
  const to = [through, monthString(monthIndex(fiscalStart(lastYear, portfolio?.policies.fyStart ?? 1)) + 11)].sort()[0];
  const rows = useMemo(() => filtered ? reportRows(filtered, kind, to, granularity, from, scheduleAsset, breakdown) : [], [filtered, kind, to, granularity, from, scheduleAsset, breakdown]);
  const totals = useMemo(() => filtered ? reportRows(filtered, kind, to, granularity, from, scheduleAsset, "totals") : [], [filtered, kind, to, granularity, from, scheduleAsset]);
  const chartData = useMemo(() => filtered ? portfolioSeries(filtered, through).map(row => ({ ...row, total: row.book + row.market })) : [], [filtered, through]);
  if (loading && !state) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-20" /><Skeleton className="h-72" /></div>;
  if (error) return <Alert variant="destructive"><AlertTitle>Property Ledger unavailable</AlertTitle><AlertDescription><p>{error}</p><Button className="mt-3" variant="outline" onClick={refresh} disabled={loading}>Retry connection</Button></AlertDescription></Alert>;
  if (!state || !portfolio || !filtered) return null;

  const money = (n: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: portfolio.policies.currency, maximumFractionDigits: 0 }).format(n);
  const compact = (n: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: portfolio.policies.currency, notation: "compact", maximumFractionDigits: 1 }).format(n);
  const area = (n: number) => `${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })} sq m`;
  const percent = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
  const entityName = (id: string) => portfolio.entities.find(e => e.id === id)?.name ?? "Unknown entity";
  const values = filtered.assets.map(asset => ({ asset, value: snapshot(asset, portfolio.policies, month) }));
  const sum = (key: keyof Pick<Snapshot, "book" | "market" | "accumulated" | "cost" | "carrying">) => values.reduce((s, item) => s + item.value[key], 0);
  const held = values.filter(item => item.value.status === "Held");
  const flags = reviewFlags(filtered, month);
  const lockMonth = portfolio.policies.lockThrough;
  const today = new Date().toISOString().slice(0, 7);
  const staleLock = !!lockMonth && monthIndex(today) - monthIndex(lockMonth) > 2;
  const selected = portfolio.assets.find(a => a.id === selectedId);
  const isSchedule = ["building-depreciation", "land-appreciation", "combined"].includes(view);
  const registerKind = view === "land-register" ? "land" : "building";
  const registerAssets = filtered.assets.filter(a => a.kind === registerKind);
  const matchingAssets = registerAssets.filter(a => `${a.name} ${a.location} ${a.tags.join(" ")} ${Object.values(a.details).join(" ")} ${portfolio.assets.find(l => l.id === a.landId)?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const registerHeld = registerAssets.filter(a => snapshot(a, portfolio.policies, month).status === "Held");
  const registerCost = registerHeld.reduce((s, a) => s + snapshot(a, portfolio.policies, month).cost, 0);
  const registerValue = registerHeld.reduce((s, a) => s + heldValue(a, portfolio, month), 0);
  const years = Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
  const register = (assetKind: Asset["kind"]) => setEditing(newAsset(assetKind, entity || portfolio.entities[0].id));

  async function saveAsset(asset: Asset) {
    return save({ ...portfolio!, assets: portfolio!.assets.some(a => a.id === asset.id) ? portfolio!.assets.map(a => a.id === asset.id ? asset : a) : [...portfolio!.assets, asset] });
  }
  async function removeAsset(asset: Asset) {
    if (portfolio!.assets.some(a => a.landId === asset.id)) { toast.error("Unlink buildings on this land before removing it"); return; }
    if (await confirm(`Remove ${asset.name}? Its original revision remains in history.`)) if (await save({ ...portfolio!, assets: portfolio!.assets.filter(a => a.id !== asset.id) })) setSelectedId("");
  }
  async function download(format: "xlsx" | "pdf", asset?: Asset) {
    setExporting(true);
    try {
      const exported = asset ? { ...filtered!, assets: [asset] } : filtered!;
      const report = asset ? schedule(assetSeries(asset, portfolio!.policies, through), "annual", portfolio!.policies.fyStart) : isSchedule ? rows : schedule(portfolioSeries(exported, through), "annual", portfolio!.policies.fyStart);
      if (format === "xlsx") {
        const fields = scheduleFields();
        await exportExcel(exported, month, report, isSchedule ? {
          headers: fields.map(c => c.title),
          body: [...rows.map(row => fields.map(c => scheduleValue(row, c.id))), ...(rows.length ? [fields.map(c => String(footer[c.id] ?? ""))] : [])],
        } : undefined);
      } else await exportPdf(exported, month, report, asset);
    } catch { toast.error("Export failed. Please retry."); }
    finally { setExporting(false); }
  }
  const title = LEDGER_PAGES.find(p => p.slug === view)!.heading;
  function scheduleValue(row: ScheduleRow, key: string) {
    if (kind === "all" && ((row.assetKind === "land" && ["depreciation", "impairment", "accumulated", "book"].includes(key)) ||
      (row.assetKind === "building" && ["market", "appreciation"].includes(key)))) return undefined;
    const value = row[key as keyof ScheduleRow];
    return typeof value === "number" && ["depreciation", "impairment", "buildingDisposals", "landDisposals"].includes(key) ? -value : value;
  }
  const valueColumn = (key: keyof Snapshot | "total", heading: string, negative = false): ColumnDef<ScheduleRow> => ({ id: key, accessorFn: row => scheduleValue(row, key), header: heading, cell: cell => {
    const value = cell.getValue<number | undefined>();
    return value === undefined ? "" : money(negative ? -Math.abs(value) : value);
  } });
  const scheduleColumns: ColumnDef<ScheduleRow>[] = [{ accessorKey: "month", header: "Period" }, ...(breakdown === "asset" ? [{ accessorKey: "assetName", header: "Asset" }] : []), ...(breakdown === "totals" ? [{ accessorKey: "count", header: kind === "building" ? "Buildings held" : kind === "land" ? "Parcels held" : "Assets held" }] : [])];
  if (kind === "building") scheduleColumns.push(valueColumn("openingBook", "Opening book value"), valueColumn("additions", "Additions"), valueColumn("depreciation", "Depreciation", true), valueColumn("impairment", "Impairment", true), ...(portfolio.policies.buildingModel === "reval" ? [valueColumn("revaluation", "Revaluation")] : []), valueColumn("buildingDisposals", "Disposals (book value)", true), valueColumn("book", "Closing book value"), valueColumn("accumulated", "Accumulated depreciation"), ...(portfolio.policies.buildingModel === "reval" ? [valueColumn("surplus", "Revaluation surplus")] : []), valueColumn("proceeds", "Sale proceeds"), valueColumn("gain", "Gain / loss on sale"), valueColumn("repairs", "Repairs expensed"));
  else if (kind === "land") scheduleColumns.push(valueColumn("openingMarket", "Opening market value"), valueColumn("additions", "Additions (cost)"), valueColumn("appreciation", "Appreciation"), valueColumn("landDisposals", "Disposals (value)", true), valueColumn("market", "Closing market value"), valueColumn("landCost", "Cost basis"), valueColumn("carrying", portfolio.policies.landModel === "reval" ? "Carrying amount (revalued)" : "Carrying amount (cost)"), ...(portfolio.policies.landModel === "reval" ? [valueColumn("surplus", "Revaluation surplus / deficit")] : []), valueColumn("proceeds", "Sale proceeds"), valueColumn("gain", "Gain / loss on sale"));
  else scheduleColumns.push(valueColumn("additions", "Additions"), valueColumn("depreciation", "Depreciation", true), valueColumn("impairment", "Impairment", true), valueColumn("accumulated", "Accumulated depreciation"), valueColumn("book", "Building book value"), valueColumn("appreciation", "Land appreciation"), valueColumn("market", "Land market value"), valueColumn("proceeds", "Sale proceeds"), valueColumn("gain", "Gain / loss on sale"), valueColumn("total", "Total value"));
  const closing = totals.at(-1), opening = totals[0];
  const footer: Record<string, React.ReactNode> = { month: "Total / closing", count: closing?.count ?? 0 };
  if (closing && opening) {
    for (const [key, n] of Object.entries(closing)) if (typeof n === "number") footer[key] = money(n);
    footer.count = closing.count; footer.openingBook = money(opening.openingBook); footer.openingMarket = money(opening.openingMarket);
    for (const key of flowKeys) footer[key] = money(totals.reduce((s, row) => s + row[key], 0) * (["depreciation", "impairment", "buildingDisposals", "landDisposals"].includes(key) ? -1 : 1));
  }
  function scheduleFields() {
    return scheduleColumns.map(column => ({ id: "id" in column && column.id ? column.id : "accessorKey" in column ? String(column.accessorKey) : "", title: String(column.header) }));
  }
  async function copySchedule() {
    const keys = scheduleFields();
    try { await copyText([keys.map(c => csv(c.title)).join(","), ...rows.map(row => keys.map(c => csv(scheduleValue(row, c.id))).join(",")), ...(rows.length ? [keys.map(c => csv(footer[c.id])).join(",")] : [])].join("\r\n")); toast.success("Schedule copied as CSV"); } catch { toast.error("Clipboard unavailable"); }
  }
  const nameColumn: ColumnDef<Asset> = { accessorKey: "name", header: registerKind === "land" ? "Land" : "Building", cell: ({ row }) => <div className="min-w-40"><button className="text-left font-medium text-primary hover:underline" onClick={() => setSelectedId(row.original.id)}>{row.original.name}</button><p className="mt-1 text-xs text-muted-foreground">{[entity ? "" : entityName(row.original.entityId), row.original.tags.join(", ")].filter(Boolean).join(" · ")}</p></div> };
  const statusColumn: ColumnDef<Asset> = { id: "status", accessorFn: asset => snapshot(asset, portfolio.policies, month).status, header: "Status", cell: cell => <Badge variant="outline">{cell.getValue<string>()}</Badge> };
  const actionsColumn: ColumnDef<Asset> = { id: "actions", header: "Actions", enableSorting: false, cell: ({ row }) => <Button variant="outline" size="sm" disabled={saving} onClick={() => setEditing(row.original)}>Edit</Button> };
  const registerColumns: ColumnDef<Asset>[] = registerKind === "land" ? [nameColumn, { accessorKey: "location", header: "Location" }, { accessorKey: "acquired", header: "Acquired" }, { id: "area", accessorFn: a => Number(a.details.area || 0), header: "Lot area", cell: cell => area(cell.getValue<number>()) }, { id: "title", accessorFn: a => a.details.titleNo || "—", header: "Title no." }, { accessorKey: "cost", header: "Cost", cell: cell => money(cell.getValue<number>()) }, { id: "rate", accessorFn: a => a.rate, header: "Rate / yr", cell: cell => `${cell.getValue<number>()}%` }, { id: "market", accessorFn: a => snapshot(a, portfolio.policies, month).market, header: "Market value", cell: cell => money(cell.getValue<number>()) }, statusColumn, actionsColumn] : [nameColumn, { id: "land", accessorFn: a => portfolio.assets.find(l => l.id === a.landId)?.name || "—", header: "Land" }, { accessorKey: "acquired", header: "In service" }, { id: "area", accessorFn: a => Number(a.details.floorArea || 0), header: "Floor area", cell: cell => area(cell.getValue<number>()) }, { id: "method", accessorFn: a => METHODS[a.method], header: "Method" }, { id: "parts", accessorFn: a => a.parts.length, header: "Parts" }, { id: "cost", accessorFn: a => snapshot(a, portfolio.policies, month).cost, header: "Cost basis", cell: cell => money(cell.getValue<number>()) }, { id: "book", accessorFn: a => snapshot(a, portfolio.policies, month).book, header: "Book value", cell: cell => money(cell.getValue<number>()) }, statusColumn, actionsColumn];
  const historyRows = state.history.filter(row => `${row.summary} ${row.actor}`.toLowerCase().includes(historyQuery.toLowerCase()));
  const historyColumns: ColumnDef<HistoryEntry>[] = [{ accessorKey: "created_at", header: "When", cell: cell => new Date(cell.getValue<string>()).toLocaleString("en-PH") }, { accessorKey: "actor", header: "Who" }, { id: "action", accessorFn: row => row.summary.split(":")[0].split(";")[0], header: "Action" }, { id: "asset", accessorFn: row => row.summary.includes(":") ? row.summary.slice(row.summary.indexOf(":") + 1).split(";")[0].trim() : "—", header: "Asset / item" }, { accessorKey: "summary", header: "Details", cell: cell => <span className="block min-w-52 whitespace-normal">Revision {cell.row.original.id} · {cell.getValue<string>()}</span> }];

  return <div className="mx-auto max-w-[1280px] space-y-4" data-ledger-page={view}>
    <PortfolioToolbar portfolio={portfolio} assets={filtered.assets} onOpen={setSelectedId} onRegister={register} exporting={exporting} onExport={format => void download(format)} />
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{title}</h1>{tag && <Badge variant="secondary">Group: {tag}</Badge>}{portfolio.policies.lockThrough && <Badge variant="outline">Locked through {portfolio.policies.lockThrough}</Badge>}</div>
      {view === "dashboard" && <Button asChild variant="outline"><Link href={ledgerPath("combined")}>Open schedule</Link></Button>}
      {(view === "land-register" || view === "building-register") && <div className="flex gap-2"><Button disabled={saving} onClick={() => register(registerKind)}><Plus className="size-4" />Register {registerKind}</Button><Button variant="outline" disabled={saving} onClick={() => setImporting(true)}><Upload className="size-4" />Paste from Excel</Button></div>}
      {isSchedule && <Button variant="outline" disabled={!rows.length} onClick={() => void copySchedule()}>Copy as CSV</Button>}
      {view === "change-history" && <div className="flex flex-wrap gap-2"><Input aria-label="Search history" placeholder="Search history" className="w-52" value={historyQuery} onChange={e => setHistoryQuery(e.target.value)} /><Button variant="outline" onClick={async () => { try { await copyText(["When,Who,Action and details", ...historyRows.map(row => [row.created_at, row.actor, row.summary].map(csv).join(","))].join("\r\n")); toast.success("History copied as CSV"); } catch { toast.error("Clipboard unavailable"); } }}>Copy as CSV</Button></div>}
    </header>

    {view === "dashboard" && <section className="space-y-4" aria-label="Portfolio overview" data-testid="dashboard-sections">
      <Card data-section="attention"><CardHeader className="py-4"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-sm">Needs attention</CardTitle><CardDescription>As of {month}</CardDescription></div></CardHeader>{(flags.length > 0 || staleLock) && <CardContent className="space-y-2 pt-0">
        {[...flags.filter(f => f.level !== "Missing info"), ...(staleLock ? [{ asset: undefined, level: "Review", note: `Books are locked only through ${lockMonth}` }] : []), ...flags.filter(f => f.level === "Missing info")].slice(0, 8).map((flag, index) => flag.asset ? <button key={index} className="flex w-full flex-wrap items-center gap-3 rounded-md border p-2 text-left text-sm hover:bg-accent" onClick={() => setSelectedId(flag.asset!.id)}><Badge variant="outline">{flag.level}</Badge><span><b>{flag.asset.name}</b> — {flag.note}</span></button> : <p key={index} className="rounded-md border p-2 text-sm"><Badge variant="outline">Review</Badge> {flag.note}</p>)}
        {flags.length + Number(staleLock) > 8 && <p className="text-sm text-muted-foreground">and {flags.length + Number(staleLock) - 8} more</p>}
      </CardContent>}</Card>
      <MetricGrid metrics={[{ label: "Building book value", value: money(sum("book")), hint: `As of ${month} · ${held.filter(a => a.asset.kind === "building").length} buildings held` }, { label: "Accumulated depreciation", value: money(sum("accumulated")), hint: `${compact(fiscalDepreciation(filtered, month))} depreciation in the fiscal year` }, { label: "Land value", value: money(sum("market")), hint: "Market projection, separate from carrying amount" }, { label: "Total value", value: money(sum("book") + sum("market")), hint: `${held.length} assets held · ${sum("cost") ? percent((sum("book") + sum("market") - sum("cost")) / sum("cost") * 100) : "0%"} vs. cost` }]} />
      {!portfolio.assets.length && <Card><CardHeader><CardTitle>Register your land and buildings</CardTitle><CardDescription>Register land parcels and buildings separately, then link buildings to the land they stand on.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button onClick={() => register("building")}>Register building</Button><Button variant="outline" onClick={() => register("land")}>Register land</Button></CardContent></Card>}
      <Card data-section="value-chart"><CardHeader><CardTitle className="text-sm">Value over time</CardTitle></CardHeader><CardContent><div className="h-72" role="img" aria-label="Portfolio building book value, land value and total value by month" data-testid="property-value-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="month" minTickGap={45} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={value => value.slice(0, 4)} /><YAxis width={60} tickFormatter={n => new Intl.NumberFormat("en", { notation: "compact" }).format(n)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} /><Tooltip formatter={n => money(Number(n))} contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: 8 }} /><Legend /><ReferenceLine x={month} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" /><Line dataKey="book" name="Building book value" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} isAnimationActive={false} /><Line dataKey="market" name="Land value" stroke="hsl(var(--warning))" dot={false} strokeWidth={2} isAnimationActive={false} /><Line dataKey="total" name="Total" stroke="hsl(var(--success))" dot={false} strokeWidth={2} isAnimationActive={false} /></LineChart></ResponsiveContainer></div><ValuationControls earliest={earliest} /></CardContent></Card>
      <Card data-section="asset-values"><CardHeader><CardTitle className="text-sm">Value by asset · {month}</CardTitle><CardDescription>Buildings at book value · Land at projected market value</CardDescription></CardHeader><CardContent className="space-y-3">{[...held].sort((a, b) => heldValue(b.asset, portfolio, month) - heldValue(a.asset, portfolio, month)).map(({ asset, value }) => { const n = asset.kind === "land" ? value.market : value.book; const max = Math.max(1, ...held.map(v => v.asset.kind === "land" ? v.value.market : v.value.book)); return <button key={asset.id} className="grid w-full min-w-0 grid-cols-[minmax(90px,180px)_minmax(0,1fr)] items-center gap-3 text-left" onClick={() => setSelectedId(asset.id)}><span className="truncate text-sm" title={asset.name}>{asset.name}</span><span className="flex min-w-0 items-center gap-2"><span className={asset.kind === "land" ? "h-4 min-w-0 rounded-sm bg-warning" : "h-4 min-w-0 rounded-sm bg-primary"} style={{ width: `${Math.max(1, n / max * 70)}%` }} /><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{compact(n)}</span></span></button>; })}{!held.length && <p className="text-sm text-muted-foreground">No assets held on this date.</p>}</CardContent></Card>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2" data-section="register-summaries">{(["land", "building"] as const).map(assetKind => { const list = values.filter(a => a.asset.kind === assetKind && a.value.status === "Held"); return <Card key={assetKind} className="min-w-0"><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle className="text-sm">{assetKind === "land" ? "Land register" : "Building register"}</CardTitle><Link className="text-sm text-primary hover:underline" href={ledgerPath(assetKind === "land" ? "land-register" : "building-register")}>Open →</Link></div></CardHeader><CardContent className="grid grid-cols-2 gap-4 text-sm">{[[assetKind === "land" ? "Parcels held" : "Buildings held", `${list.length} of ${filtered.assets.filter(a => a.kind === assetKind).length}`], [assetKind === "land" ? "Market value" : "Book value", money(list.reduce((s, item) => s + (assetKind === "land" ? item.value.market : item.value.book), 0))], [assetKind === "land" ? "Cost" : "Cost basis", money(list.reduce((s, item) => s + item.value.cost, 0))], [assetKind === "land" ? "Lot area" : "Floor area", area(list.reduce((s, item) => s + Number(item.asset.details[assetKind === "land" ? "area" : "floorArea"] || 0), 0))]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>)}</CardContent></Card>; })}</div>
      <Card data-section="groups"><CardHeader><CardTitle className="text-sm">Groups · {month}</CardTitle><CardDescription>Click a group to filter the portfolio. Assets with several tags count in each group.</CardDescription></CardHeader><CardContent><Table aria-label="Property groups"><TableHeader><TableRow>{["Group", "Land", "Buildings", "Building book value", "Land value", "Total value"].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{[...new Set(portfolio.assets.filter(a => !entity || a.entityId === entity).flatMap(a => a.tags))].sort().map(group => { const list = portfolio.assets.filter(a => (!entity || a.entityId === entity) && a.tags.includes(group)); const bv = list.filter(a => a.kind === "building").reduce((s, a) => s + heldValue(a, portfolio, month), 0); const lv = list.filter(a => a.kind === "land").reduce((s, a) => s + heldValue(a, portfolio, month), 0); return <TableRow key={group} data-state={tag === group ? "selected" : undefined}><TableCell><button className="font-medium text-primary hover:underline" onClick={() => setTag(tag === group ? "" : group)}>{group}</button></TableCell><TableCell>{list.filter(a => a.kind === "land").length}</TableCell><TableCell>{list.filter(a => a.kind === "building").length}</TableCell><TableCell>{money(bv)}</TableCell><TableCell>{money(lv)}</TableCell><TableCell>{money(bv + lv)}</TableCell></TableRow>; })}</TableBody></Table></CardContent></Card>
    </section>}

    {(view === "land-register" || view === "building-register") && <section className="space-y-4" aria-label={title}>
      <MetricGrid metrics={[{ label: registerKind === "land" ? "Parcels registered" : "Buildings registered", value: String(registerAssets.length), hint: `${registerHeld.length} held · ${registerAssets.filter(a => a.sale && a.sale.date <= month).length} sold · as of ${month}` }, { label: registerKind === "land" ? "Total cost" : "Total cost basis", value: money(registerCost), hint: `Assets held on ${month}` }, { label: registerKind === "land" ? "Market value" : "Book value", value: money(registerValue), hint: registerCost ? `${percent((registerValue - registerCost) / registerCost * 100)} vs. cost` : "No cost recorded" }, { label: registerKind === "land" ? "Total lot area" : "Total floor area", value: area(registerHeld.reduce((s, a) => s + Number(a.details[registerKind === "land" ? "area" : "floorArea"] || 0), 0)), hint: registerKind === "land" ? `${registerAssets.reduce((s, a) => s + a.events.length, 0)} appraisals recorded` : `${registerAssets.reduce((s, a) => s + a.parts.filter(p => p.date > a.acquired).length, 0)} improvements recorded` }]} />
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-sm">{matchingAssets.length} {registerKind === "land" ? "parcels" : "buildings"} · values as of {month}</CardTitle><Input aria-label={registerKind === "land" ? "Search land register" : "Search building register"} placeholder={`Search ${registerKind === "land" ? "land" : "buildings"}`} className="w-60" value={query} onChange={e => setQuery(e.target.value)} /></div></CardHeader><CardContent><LedgerTable key={`${view}:${query}:${entity}:${tag}`} rows={matchingAssets} columns={registerColumns} label={`${registerKind} register`} /><ValuationControls earliest={earliest} /></CardContent></Card>
    </section>}

    {isSchedule && <section className="space-y-4" aria-label={title}>
      <Card><CardContent className="flex flex-wrap items-end gap-5 pt-5"><div><p className="mb-2 text-sm font-medium">Period</p><div role="group" aria-label="Period" className="flex gap-1">{(["monthly", "quarterly", "annual"] as const).map(g => <Button key={g} size="sm" variant={granularity === g ? "default" : "outline"} aria-pressed={granularity === g} onClick={() => setGranularity(g)}>{g === "annual" ? "Annually" : g === "monthly" ? "Monthly" : "Quarterly"}</Button>)}</div></div><Field label="Asset"><select className={`${selectClass} max-w-60`} value={scheduleAsset} onChange={e => setScheduleAsset(e.target.value)}><option value="">All {kind === "all" ? "assets" : kind === "land" ? "land" : "buildings"}</option>{filtered.assets.filter(a => kind === "all" || a.kind === kind).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field><Field label="From"><select className={`${selectClass} w-24`} value={firstYear} onChange={e => { setFromYear(Number(e.target.value)); if (Number(e.target.value) > lastYear) setToYear(Number(e.target.value)); }}>{years.map(y => <option key={y} value={y}>FY {y}</option>)}</select></Field><Field label="To"><select className={`${selectClass} w-24`} value={lastYear} onChange={e => { setToYear(Number(e.target.value)); if (Number(e.target.value) < firstYear) setFromYear(Number(e.target.value)); }}>{years.map(y => <option key={y} value={y}>FY {y}</option>)}</select></Field><div><p className="mb-2 text-sm font-medium">Breakdown</p><div role="group" aria-label="Breakdown" className="flex gap-1"><Button size="sm" variant={breakdown === "totals" ? "default" : "outline"} aria-pressed={breakdown === "totals"} onClick={() => setBreakdown("totals")}>Totals</Button><Button size="sm" variant={breakdown === "asset" ? "default" : "outline"} aria-pressed={breakdown === "asset"} onClick={() => setBreakdown("asset")}>By asset</Button></div></div></CardContent></Card>
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-sm">{title} · {granularity === "annual" ? "Annual" : granularity === "monthly" ? "Monthly" : "Quarterly"} · {scheduleAsset ? filtered.assets.find(a => a.id === scheduleAsset)?.name : `All ${kind === "all" ? "assets" : kind === "land" ? "land" : "buildings"}`}</CardTitle><CardDescription>{rows.length} rows · {from} – {to}</CardDescription></div></CardHeader><CardContent><LedgerTable key={`${view}:${granularity}:${breakdown}:${scheduleAsset}:${entity}:${tag}:${firstYear}:${lastYear}`} rows={breakdown === "asset" ? rows.slice(0, 2000) : rows} columns={scheduleColumns} label={title} footer={footer} />{breakdown === "asset" && rows.length > 2000 && <p className="text-xs text-muted-foreground">Showing the first 2,000 rows. CSV and Excel include all {rows.length} rows.</p>}<p className="mt-4 text-xs leading-relaxed text-muted-foreground">Flows (additions, depreciation, appreciation and sales) are period totals. Balances are the period’s last month. Opening values are the preceding month’s close. Depreciation starts in each component’s in-service month. Estimates only — not an appraisal or tax advice; no general-ledger entries are posted.</p></CardContent></Card>
    </section>}
    {view === "accounting-policies" && <PoliciesPanel key={state.revision} portfolio={portfolio} canManage={state.canManage} saving={saving} onSave={save} />}
    {view === "change-history" && <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-sm">{historyRows.length} changes</CardTitle><CardDescription>Latest 400 revisions · all revisions retained in storage</CardDescription></div></CardHeader><CardContent><LedgerTable key={historyQuery} rows={historyRows} columns={historyColumns} label="Property ledger change history" /></CardContent></Card>}
    {selected && <AssetDetails key={selected.id} asset={selected} portfolio={portfolio} month={month} saving={saving} onClose={() => setSelectedId("")} onEdit={() => setEditing(selected)} onEvent={() => setEventAsset(selected)} onExport={() => void download("pdf", selected)} onSave={saveAsset} onSavePortfolio={save} onRemove={() => void removeAsset(selected)} onDuplicate={() => {
      const partIds = new Map(selected.parts.map(p => [p.id, duplicateId()]));
      setEditing({ ...selected, id: duplicateId(), version: 1, name: `${selected.name.slice(0, 113)} (copy)`, sale: null,
        parts: selected.parts.map(p => ({ ...p, id: partIds.get(p.id)! })),
        events: selected.events.map(e => ({ ...e, id: duplicateId(), improvementId: e.improvementId ? partIds.get(e.improvementId) : undefined })),
      });
    }} onRegisterBuilding={() => setEditing({ ...newAsset("building", selected.entityId), landId: selected.id, location: selected.location })} />}
    {editing && <AssetDialog key={editing.id} initial={editing} portfolio={portfolio} saving={saving} onClose={() => setEditing(null)} onSave={saveAsset} />}
    {eventAsset && <EventDialog key={eventAsset.id} asset={eventAsset} policies={portfolio.policies} saving={saving} onClose={() => setEventAsset(null)} onSave={saveAsset} />}
    {importing && <ImportDialog kind={registerKind} entityId={entity || portfolio.entities[0].id} existing={portfolio.assets} lockThrough={portfolio.policies.lockThrough} saving={saving} onClose={() => setImporting(false)} onSave={assets => save({ ...portfolio, assets: [...portfolio.assets, ...assets] })} />}
    {confirmation}
  </div>;
}
