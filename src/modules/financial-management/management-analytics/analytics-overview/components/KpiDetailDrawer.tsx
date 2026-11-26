"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { Callout, MicroLabel, Panel, Stat } from "@/modules/financial-management/management-analytics/shared/BoardKit";
import { TrendChart, type Tone } from "@/modules/financial-management/management-analytics/shared/Charts";

import { DOMAIN_LABEL, STATUS_META } from "../constants";
import { changeText, deviation, forecast, formatNumber, formatValue, ruleText } from "../services/engine";
import type { OverviewRow, StatusCode } from "../types";
import { StatusBadge } from "./StatusBadge";

const TONE: Record<StatusCode, Tone> = {
  ON_TRACK: "success",
  FAVORABLE: "info",
  WATCH: "warning",
  PROVISIONAL: "primary",
  CONFIRMED: "danger",
  NO_DATA: "muted",
};

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortMonth(period: string): string {
  const [y, m] = period.split("-");
  const name = SHORT_MONTHS[Number(m) - 1];
  return name ? `${name} ${y.slice(2)}` : period;
}

export function KpiDetailDrawer({
  row,
  companyName,
  asOf,
  onOpenChange,
}: {
  row: OverviewRow | null;
  companyName: string;
  asOf: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState("desc");
  const [recoveryPct, setRecoveryPct] = useState(50);

  const fc = useMemo(() => (row ? forecast(row.points, row.kpi, 3) : null), [row]);

  if (!row) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-[680px]" />
      </Sheet>
    );
  }

  const meta = STATUS_META[row.status.code];
  const dev = row.status.deviation;
  const bandPct = row.kpi.rule_type === "PCT" && row.kpi.threshold ? row.kpi.threshold / 100 : undefined;

  const recent12 = row.points.slice(-12);
  const latestIdx = row.points.findLastIndex((p) => p.actual !== null);
  const prevMonth = latestIdx > 0 ? row.points[latestIdx - 1]?.actual ?? null : null;
  const lastYear = latestIdx >= 12 ? row.points[latestIdx - 12]?.actual ?? null : null;
  const curYear = asOf.slice(0, 4);
  const ytdPts = row.points.filter((p) => p.period.startsWith(curYear) && p.actual !== null);
  const ytdActual = ytdPts.length > 0 ? ytdPts.reduce((s, p) => s + (p.actual ?? 0), 0) / ytdPts.length : null;
  const ytdTargetPts = ytdPts.filter((p) => p.target !== null);
  const ytdTarget = ytdTargetPts.length > 0 ? ytdTargetPts.reduce((s, p) => s + (p.target ?? 0), 0) / ytdTargetPts.length : null;

  const relDelta = (a: number | null, b: number | null) => {
    if (a === null || b === null || b === 0) return null;
    return ((a - b) / Math.abs(b)) * 100;
  };
  const momPct = relDelta(row.actual, prevMonth);
  const yoyPct = relDelta(row.actual, lastYear);
  const ytdDev = ytdActual !== null && ytdTarget !== null ? deviation(row.kpi, ytdActual, ytdTarget) : null;

  // Prescriptive interactive sensitivity model
  const gap = row.actual !== null && row.target !== null ? row.actual - row.target : 0;
  const projected =
    row.actual !== null && row.target !== null && dev?.unfavorable
      ? row.actual - gap * (recoveryPct / 100)
      : row.actual;
  const projectedDev = projected !== null && row.target !== null ? deviation(row.kpi, projected, row.target) : null;

  return (
    <Sheet open={Boolean(row)} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[680px]">
        <SheetHeader className="border-b border-border/60 px-6 py-4 text-left">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.07em] text-muted-foreground">
            <span>{companyName}</span>
            <span>·</span>
            <span>{DOMAIN_LABEL[row.kpi.domain] ?? row.kpi.domain}</span>
            <span>·</span>
            <span className="font-mono">{asOf}</span>
          </div>
          <SheetTitle className="text-xl font-semibold tracking-tight">{row.kpi.name}</SheetTitle>
          <SheetDescription asChild>
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-2xl font-medium text-foreground tabular-nums">
                  {row.actual === null ? "no reading" : formatValue(row.actual, row.kpi)}
                  {row.actual !== null && row.kpi.unit ? (
                    <span className="ml-1 text-xs text-muted-foreground">{row.kpi.unit}</span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  Target {row.target === null ? "not set" : formatValue(row.target, row.kpi)} · {ruleText(row.kpi)} ·{" "}
                  {row.kpi.polarity === "LOW" ? "lower is better" : "higher is better"}
                </span>
                <StatusBadge tone={meta.tone}>
                  {dev ? `${dev.text} · ` : ""}
                  {meta.label}
                </StatusBadge>
              </div>
              {row.kpi.definition ? <p className="text-xs text-muted-foreground">{row.kpi.definition}</p> : null}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <Tabs value={tab} onValueChange={setTab} className="space-y-4">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="desc">Descriptive</TabsTrigger>
              <TabsTrigger value="diag">Diagnostic</TabsTrigger>
              <TabsTrigger value="pred">Predictive</TabsTrigger>
              <TabsTrigger value="presc">Prescriptive</TabsTrigger>
            </TabsList>

            <TabsContent value="desc" className="space-y-4">
              <p className="text-xs text-muted-foreground">
                What happened? 12-month actual trend against target and tolerance band through {asOf}.
              </p>
              <Panel className="p-4">
                <TrendChart points={recent12} dp={row.kpi.dp} tone={TONE[row.status.code]} bandPct={bandPct} />
              </Panel>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Panel className="p-3">
                  <Stat
                    label="vs Target"
                    value={dev ? dev.text : "—"}
                    tone={dev ? (dev.unfavorable ? "danger" : "success") : "muted"}
                    note={row.target !== null ? formatValue(row.target, row.kpi) : "no target"}
                  />
                </Panel>
                <Panel className="p-3">
                  <Stat
                    label="vs Prior month"
                    value={momPct !== null ? `${momPct > 0 ? "+" : ""}${momPct.toFixed(1)}%` : "—"}
                    note={prevMonth !== null ? formatValue(prevMonth, row.kpi) : "no reading"}
                  />
                </Panel>
                <Panel className="p-3">
                  <Stat
                    label="vs Last year"
                    value={yoyPct !== null ? `${yoyPct > 0 ? "+" : ""}${yoyPct.toFixed(1)}%` : "—"}
                    note={lastYear !== null ? formatValue(lastYear, row.kpi) : "no reading"}
                  />
                </Panel>
                <Panel className="p-3">
                  <Stat
                    label="YTD avg vs Target"
                    value={ytdDev ? ytdDev.text : "—"}
                    tone={ytdDev ? (ytdDev.unfavorable ? "danger" : "success") : "muted"}
                    note={ytdActual !== null ? formatValue(ytdActual, row.kpi) : "no reading"}
                  />
                </Panel>
              </div>
              <Panel className="overflow-x-auto">
                <div className="border-b border-border/60 px-3 py-2">
                  <MicroLabel>12-month target vs actual calendar</MicroLabel>
                </div>
                <table className="w-full min-w-[540px] text-center font-mono text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-border/50 text-[10.5px] text-muted-foreground">
                      <th className="px-2 py-1.5 text-left font-sans">Row</th>
                      {recent12.map((p) => (
                        <th key={p.period} className={cn("px-1.5 py-1.5", p.period === asOf && "text-primary font-semibold")}>
                          {shortMonth(p.period)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    <tr>
                      <td className="px-2 py-1.5 text-left font-sans text-muted-foreground">Target</td>
                      {recent12.map((p) => (
                        <td key={`t-${p.period}`} className="px-1.5 py-1.5 text-muted-foreground">
                          {p.target !== null ? formatNumber(p.target, row.kpi.dp) : "—"}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-2 py-1.5 text-left font-sans font-medium">Actual</td>
                      {recent12.map((p) => (
                        <td key={`a-${p.period}`} className={cn("px-1.5 py-1.5", p.period === asOf && "font-semibold text-primary")}>
                          {p.actual !== null ? formatNumber(p.actual, row.kpi.dp) : "—"}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </Panel>
            </TabsContent>

            <TabsContent value="diag" className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Why did it happen? Rule evaluation, accountable ownership, source lineage, and variance run details.
              </p>
              <Panel className="divide-y divide-border/50 text-xs">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">KPI Key</span>
                  <span className="font-mono">{row.kpi.kpi_key}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Accountable Owner Position</span>
                  <span className="font-medium">{row.kpi.owner_position ?? "Unassigned"}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Threshold Rule</span>
                  <span className="font-mono">{ruleText(row.kpi)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Source Feeds</span>
                  <span className="font-mono">{row.kpi.source_codes ?? "Manual / ERP"}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Variance Run</span>
                  <span>{row.status.run ? row.status.run.reason : "Within tolerance"}</span>
                </div>
              </Panel>
              {row.kpi.domain === "WORKFORCE" ? (
                <Callout tone="info" title="Data Privacy Act (RA 10173)">
                  Employee-level WorkSync attendance records are personal data and are aggregated at unit and company
                  level on this board.
                </Callout>
              ) : null}
            </TabsContent>

            <TabsContent value="pred" className="space-y-4">
              <p className="text-xs text-muted-foreground">
                What is likely to happen?{" "}
                {fc?.enoughHistory ? `${fc.method} fitted on readings through ${asOf}.` : "Needs at least 4 monthly readings to forecast."}
              </p>
              <Panel className="p-4">
                <TrendChart
                  points={recent12}
                  dp={row.kpi.dp}
                  tone={TONE[row.status.code]}
                  bandPct={bandPct}
                  forecast={fc}
                />
              </Panel>
              {fc && fc.enoughHistory ? (
                <>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <Panel className="p-3">
                      <Stat
                        label="Next month (+1)"
                        value={formatValue(fc.points[0], row.kpi)}
                        note={`80%: ${formatNumber(fc.points[0] - (fc.band80[0] ?? 0), row.kpi.dp)} – ${formatNumber(fc.points[0] + (fc.band80[0] ?? 0), row.kpi.dp)}`}
                      />
                    </Panel>
                    <Panel className="p-3">
                      <Stat
                        label="3-month outlook (+3)"
                        value={formatValue(fc.points[2] ?? fc.points[0], row.kpi)}
                        note={
                          row.target !== null
                            ? `${changeText(deviation(row.kpi, fc.points[2] ?? fc.points[0], row.target).value, row.kpi)} vs target`
                            : "no target"
                        }
                      />
                    </Panel>
                    <Panel className="p-3">
                      <Stat
                        label="P(breach next)"
                        value={`${Math.round((fc.breachProbability ?? 0) * 100)}%`}
                        tone={
                          (fc.breachProbability ?? 0) > 0.6
                            ? "danger"
                            : (fc.breachProbability ?? 0) > 0.3
                              ? "warning"
                              : "success"
                        }
                        note={`Unfavorable beyond ${ruleText(row.kpi)}`}
                      />
                    </Panel>
                  </div>
                  {(fc.breachProbability ?? 0) > 0.6 && !row.status.memoRequired ? (
                    <Callout tone="danger" title="High breach risk">
                      Forecast exceeds a 60% probability of breaching next period. Consider preventive remediation before
                      confirmation.
                    </Callout>
                  ) : null}
                </>
              ) : null}
            </TabsContent>

            <TabsContent value="presc" className="space-y-4">
              <p className="text-xs text-muted-foreground">
                What should we do? Suggested accountable owner:{" "}
                <strong className="text-foreground">{row.kpi.owner_position ?? "Company General Manager"}</strong>.
              </p>
              <Callout tone="primary" title="Recommended remediation path">
                {row.status.memoRequired
                  ? "File a root-cause memo in Variance Protocol, assign an accountable owner position, and record post-fix verification readings until the KPI remains within tolerance for the required closing streak."
                  : "KPI is currently within policy limits. Monitor monthly trend and verify upcoming seasonal targets."}
              </Callout>
              <Panel className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Scenario: sensitivity analysis</p>
                    <p className="text-xs text-muted-foreground">
                      Drag to model how much of the current variance gap is closed by remediation.
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono tabular-nums">
                    {recoveryPct}% gap closed
                  </Badge>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={recoveryPct}
                  onChange={(event) => setRecoveryPct(Number(event.target.value))}
                  aria-label="Share of variance gap closed"
                  className="w-full accent-primary"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                  <span className="font-mono tabular-nums">
                    Projected:{" "}
                    <strong>{projected !== null ? formatValue(projected, row.kpi) : "—"}</strong>{" "}
                    {projectedDev ? `(${projectedDev.text})` : ""}
                  </span>
                  {projectedDev ? (
                    <StatusBadge
                      tone={
                        projectedDev.over
                          ? projectedDev.unfavorable
                            ? "danger"
                            : "info"
                          : projectedDev.watch
                            ? "warning"
                            : "success"
                      }
                    >
                      {projectedDev.over
                        ? projectedDev.unfavorable
                          ? "Still over limit"
                          : "Favorable"
                        : projectedDev.watch
                          ? "Watch"
                          : "Within tolerance"}
                    </StatusBadge>
                  ) : null}
                </div>
              </Panel>
            </TabsContent>
          </Tabs>

          {row.status.memoRequired ? (
            <div className="mt-4">
              <Callout tone="danger" title="Confirmed variance requires remediation">
                {row.status.run?.reason ?? "Threshold breached."}{" "}
                <Link
                  href={`/fm/management-analytics/analytics-variance?period=${asOf}`}
                  onClick={() => onOpenChange(false)}
                  className="font-semibold underline"
                >
                  Open in Variance Protocol →
                </Link>
              </Callout>
            </div>
          ) : row.status.code === "PROVISIONAL" ? (
            <div className="mt-4">
              <Callout tone="warning" title="Provisional breach — monitoring">
                {row.status.run?.reason ?? "Over threshold, awaiting sustaining period to confirm."}
              </Callout>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
