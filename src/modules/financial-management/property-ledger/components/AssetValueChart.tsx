"use client";
import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Asset, Portfolio } from "../types";
import { assetSeries } from "../utils/engine";
import { formatMonth } from "../utils/dates";
import { formatMoney } from "../utils/format";

export function AssetValueChart({ asset, portfolio, month, through }: { asset: Asset; portfolio: Portfolio; month: string; through: string }) {
  const building = asset.kind === "building";
  const rows = assetSeries(asset, portfolio.policies, through);
  return <div className="space-y-3">
    <h3 className="font-semibold">{building ? "Book value over time" : "Market value over time"}</h3>
    <div className="h-72 w-full" role="img" aria-label={building ? "Building book value and accumulated depreciation by month" : "Land market value, cost and appraisals by month"}>
      <ResponsiveContainer width="100%" height="100%"><LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" minTickGap={45} tickFormatter={v => String(v).slice(0, 4)} />
        <YAxis width={70} tickFormatter={v => new Intl.NumberFormat("en", { notation: "compact" }).format(v)} />
        <Tooltip labelFormatter={v => formatMonth(String(v))} formatter={v => formatMoney(Number(v), portfolio.policies.currency)} /><Legend />
        <ReferenceLine x={month} strokeDasharray="4 4" />
        <Line dataKey={building ? "book" : "market"} name={building ? "Book value" : "Market value"} stroke="hsl(var(--primary))" dot={false} isAnimationActive={false} />
        <Line dataKey={building ? "accumulated" : "cost"} name={building ? "Accumulated depreciation" : "Cost"} stroke="hsl(var(--warning))" dot={false} isAnimationActive={false} />
        {asset.events.filter(e => e.kind === "appraisal").map(e => <ReferenceDot key={e.id} x={e.date} y={e.amount} r={4} fill="hsl(var(--primary))" />)}
        {asset.parts.filter(p => p.date > asset.acquired).map(p => <ReferenceLine key={p.id} x={p.date} strokeDasharray="2 4" label={{ value: p.name, fontSize: 10 }} />)}
        {asset.sale && <ReferenceLine x={asset.sale.date} label="Sold" />}
      </LineChart></ResponsiveContainer>
    </div>
  </div>;
}
