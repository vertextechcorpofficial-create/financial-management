"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { monthIndex, monthString } from "../utils/engine";
import { usePropertyLedgerContext } from "../providers/PropertyLedgerProvider";

export function MetricGrid({ metrics }: { metrics: { label: string; value: string; hint?: string }[] }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="ledger-kpis">{metrics.map(metric => <Card key={metric.label} className="min-w-0 py-0"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{metric.label}</p><p className="mt-2 text-xl font-semibold tracking-tight tabular-nums break-words">{metric.value}</p>{metric.hint && <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>}</CardContent></Card>)}</div>;
}
export function ValuationControls({ earliest }: { earliest: string }) {
  const { month, setMonth, through, setThrough } = usePropertyLedgerContext();
  const first = Math.min(monthIndex(earliest), monthIndex(month));
  const last = Math.max(monthIndex(through), monthIndex(month));
  return <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
    <label htmlFor="valuation-month">Valuation date</label>
    <input aria-label="Valuation date slider" type="range" className="min-w-28 flex-1 accent-primary" min={first} max={last} value={monthIndex(month)} onChange={e => setMonth(monthString(Number(e.target.value)))} />
    <Input id="valuation-month" aria-label="Valuation month" type="month" className="w-40" min="1900-01" max="2199-12" value={month} onChange={e => { if (/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)) { setMonth(e.target.value); if (e.target.value > through) setThrough(e.target.value); } }} />
    <label htmlFor="projection-end">Project through</label><Input id="projection-end" aria-label="Project through year" type="number" className="w-24" min={Number(month.slice(0, 4))} max={2199} value={Number(through.slice(0, 4))} onChange={e => { const year = Number(e.target.value); if (year >= Number(month.slice(0, 4)) && year <= 2199) setThrough(`${year}-12`); }} />
  </div>;
}
