"use client";

import React from "react";
import { useStatementOfChangesInEquity } from "../../../hooks/useStatementOfChangesInEquity";
import { formatCurrency } from "../../../utils/format";
import { SCETrendPoint } from "../../../types";
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
} from "recharts";

export function SCEHistoricalTrendTab() {
  const { data, setPeriodDate, filters } = useStatementOfChangesInEquity();
  const trend = data?.trend || [];

  return (
    <div className="flex flex-col gap-4">
      {/* Period Range Context Pill */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300">
          12 months · Nov 2025 to Oct 2026 · {filters.basis === "restated" ? "restated basis" : "reported basis"}
        </span>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Click any point, bar, or column header to select that reporting period.
        </span>
      </div>

      {/* 2 Side-by-side charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Ending Total Equity Line Chart */}
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm">
          <div>
            <h3 className="font-semibold text-sm text-foreground">Ending total equity</h3>
            <p className="text-xs text-muted-foreground">
              Closing balance at each period end (GL)
            </p>
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
                  formatter={(val: unknown) => [formatCurrency(Number(val)), "Ending Equity"]}
                  labelFormatter={(lbl) => `Period: ${lbl}`}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="endingEquity"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: "#2563eb" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Profit / (loss) Bar Chart */}
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm">
          <div>
            <h3 className="font-semibold text-sm text-foreground">Profit / (loss) for the period</h3>
            <p className="text-xs text-muted-foreground">
              Net income transferred from the Income Statement
            </p>
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
                  formatter={(val: unknown) => [formatCurrency(Number(val)), "Net Profit"]}
                  labelFormatter={(lbl) => `Period: ${lbl}`}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="profit" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Historical Trend Roll-Forward Table */}
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm overflow-x-auto">
        <h3 className="font-semibold text-sm text-foreground">
          Historical movements matrix (12 months · Nov 2025 to Oct 2026)
        </h3>
        <p className="text-xs text-muted-foreground">
          Click any column header to select that reporting period.
        </p>

        <table className="w-full min-w-[950px] border-collapse text-left text-xs mt-2">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="py-2.5 px-3 font-semibold text-muted-foreground uppercase tracking-wider sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r w-52 min-w-[200px]">
                METRIC
              </th>
              {trend.map((t: SCETrendPoint) => (
                <th
                  key={t.periodKey}
                  className="py-2.5 px-3 text-right font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50"
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
              <td className="py-2 px-3 font-sans font-medium text-foreground sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r w-52 min-w-[200px]">
                Beginning equity
              </td>
              {trend.map((t: SCETrendPoint) => (
                <td key={t.periodKey} className="py-2 px-3 text-right">
                  {formatCurrency(t.beginningEquity)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-2 px-3 font-sans font-medium text-foreground sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r w-52 min-w-[200px]">
                Profit / (loss)
              </td>
              {trend.map((t: SCETrendPoint) => (
                <td key={t.periodKey} className="py-2 px-3 text-right">
                  {formatCurrency(t.profit)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-2 px-3 font-sans font-medium text-foreground sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r w-52 min-w-[200px]">
                Ending total equity
              </td>
              {trend.map((t: SCETrendPoint) => (
                <td key={t.periodKey} className="py-2 px-3 text-right font-bold text-foreground">
                  {formatCurrency(t.endingEquity)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-2 px-3 font-sans font-medium text-foreground sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r w-52 min-w-[200px]">
                Reconciliation
              </td>
              {trend.map((t: SCETrendPoint) => (
                <td key={t.periodKey} className="py-2 px-3 text-right font-sans">
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
  );
}
