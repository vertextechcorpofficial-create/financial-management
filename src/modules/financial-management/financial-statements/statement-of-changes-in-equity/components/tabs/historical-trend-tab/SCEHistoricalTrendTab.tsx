"use client";

import React from "react";
import { useStatementOfChangesInEquity } from "../../../hooks/useStatementOfChangesInEquity";
import { formatCurrency } from "../../../utils/format";
import { SCETrendPoint } from "../../../types";
import { Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  payload: SCETrendPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function TrendCustomTooltip({
  active,
  payload,
  label,
}: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-lg border bg-card/95 p-2.5 shadow-xl backdrop-blur-sm text-xs min-w-[160px] z-50">
      <div className="font-semibold text-foreground border-b pb-1 mb-1.5 flex items-center justify-between">
        <span>Period: {label}</span>
      </div>
      <div className="flex flex-col gap-1">
        {payload.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between gap-3 font-mono">
            <span className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-sans">
              <span
                className="h-2 w-2 rounded-full inline-block"
                style={{ backgroundColor: item.color }}
              />
              {item.name}:
            </span>
            <span className="font-medium text-foreground whitespace-nowrap">
              {formatCurrency(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SCEHistoricalTrendTab() {
  const { data, setPeriodDate, filters, isLoading } = useStatementOfChangesInEquity();
  const trend = data?.trend || [];
  const hasComparison = !!filters.compare && !!data?.hasComparison;
  const comparisonLabel = data?.comparisonLabel || "Comparison";

  return (
    <div className="relative flex flex-col gap-4">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-30 rounded-lg">
          <div className="flex items-center gap-2 bg-card border shadow-lg px-4 py-2 rounded-lg text-xs font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Recalculating historical trend...</span>
          </div>
        </div>
      )}

      {/* Period Range Context Pill */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300">
          Trailing 12 months up to {filters.periodLabel} · {filters.basis === "restated" ? "restated basis" : "reported basis"}
        </span>
        {hasComparison && (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
            Comparing with {comparisonLabel}
          </span>
        )}
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Click any point, bar, or column header to select that reporting period.
        </span>
      </div>

      {/* 2 Side-by-side charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Ending Total Equity Line Chart */}
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-foreground">Ending total equity</h3>
              <p className="text-xs text-muted-foreground">
                Closing balance at each period end (GL)
              </p>
            </div>
            {hasComparison && (
              <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                Dual Series
              </span>
            )}
          </div>
          <div className="h-72 w-full pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 10, right: 15, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="periodLabel"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={40}
                  className="text-muted-foreground"
                />
                <YAxis
                  tickFormatter={(v) => `₱${(v / 1000000).toFixed(1)}M`}
                  tick={{ fontSize: 10 }}
                  domain={[(dataMin: number) => dataMin - 1000000, (dataMax: number) => dataMax + 1000000]}
                  className="text-muted-foreground"
                />
                <Tooltip
                  content={
                    <TrendCustomTooltip />
                  }
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: "11px", paddingBottom: "8px" }}
                />
                <Line
                  type="monotone"
                  name="Current Ending Equity"
                  dataKey="endingEquity"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: "#2563eb" }}
                  activeDot={{ r: 6 }}
                />
                {hasComparison && (
                  <Line
                    type="monotone"
                    name={`Comparison (${comparisonLabel})`}
                    dataKey="comparisonEndingEquity"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: "#94a3b8" }}
                    activeDot={{ r: 5 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Profit / (loss) Bar Chart */}
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-foreground">Profit / (loss) for the period</h3>
              <p className="text-xs text-muted-foreground">
                Net income transferred from the Income Statement
              </p>
            </div>
          </div>
          <div className="h-72 w-full pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 10, right: 15, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="periodLabel"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={40}
                  className="text-muted-foreground"
                />
                <YAxis
                  tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}K`}
                  tick={{ fontSize: 10 }}
                  domain={[0, "auto"]}
                  className="text-muted-foreground"
                />
                <Tooltip
                  content={
                    <TrendCustomTooltip />
                  }
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: "11px", paddingBottom: "8px" }}
                />
                <Bar name="Net Profit" dataKey="profit" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                {hasComparison && (
                  <Bar
                    name={`Comparison (${comparisonLabel})`}
                    dataKey="comparisonProfit"
                    fill="#94a3b8"
                    radius={[4, 4, 0, 0]}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Historical Trend Roll-Forward Table with Pinned Sticky Headers */}
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="font-semibold text-sm text-foreground">
          Historical movements matrix (12 months trailing)
        </h3>
        <p className="text-xs text-muted-foreground">
          Click any column header to select that reporting period.
        </p>

        {/* Scrollable Container with Sticky Table Header and First Column */}
        <div className="overflow-auto max-h-[380px] border rounded-md mt-2">
          <table className="w-full min-w-[950px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b bg-muted/95 backdrop-blur-xs shadow-xs sticky top-0 z-20">
                <th className="py-2.5 px-3 font-semibold text-muted-foreground uppercase tracking-wider sticky left-0 z-30 bg-card/95 border-r w-52 min-w-[200px] whitespace-nowrap">
                  METRIC
                </th>
                {trend.map((t: SCETrendPoint) => (
                  <th
                    key={t.periodKey}
                    className="py-2.5 px-3 text-right font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                    onClick={() => setPeriodDate(`${t.periodKey}-28`)}
                  >
                    <div>{t.periodLabel}</div>
                    {t.isRestated && (
                      <span className="text-[9px] font-normal text-blue-600 dark:text-blue-400">
                        RESTATED
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-[11px]">
              <tr>
                <td className="py-2.5 px-3 font-sans font-medium text-foreground sticky left-0 z-10 bg-card/95 border-r w-52 min-w-[200px] whitespace-nowrap">
                  Beginning equity
                </td>
                {trend.map((t: SCETrendPoint) => (
                  <td key={t.periodKey} className="py-2.5 px-3 text-right whitespace-nowrap">
                    {formatCurrency(t.beginningEquity)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans font-medium text-foreground sticky left-0 z-10 bg-card/95 border-r w-52 min-w-[200px] whitespace-nowrap">
                  Profit / (loss)
                </td>
                {trend.map((t: SCETrendPoint) => (
                  <td key={t.periodKey} className="py-2.5 px-3 text-right whitespace-nowrap">
                    {formatCurrency(t.profit)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans font-medium text-foreground sticky left-0 z-10 bg-card/95 border-r w-52 min-w-[200px] whitespace-nowrap">
                  Ending total equity
                </td>
                {trend.map((t: SCETrendPoint) => (
                  <td key={t.periodKey} className="py-2.5 px-3 text-right font-bold text-foreground whitespace-nowrap">
                    {formatCurrency(t.endingEquity)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans font-medium text-foreground sticky left-0 z-10 bg-card/95 border-r w-52 min-w-[200px] whitespace-nowrap">
                  Reconciliation
                </td>
                {trend.map((t: SCETrendPoint) => (
                  <td key={t.periodKey} className="py-2.5 px-3 text-right font-sans whitespace-nowrap">
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
                      Balanced
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
