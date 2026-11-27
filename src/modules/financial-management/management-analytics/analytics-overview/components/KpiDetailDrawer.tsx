"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

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

import { convertPhpValue, displayUnitForCurrency, type CurrencyCode } from "./analytics-screens";
import { Callout, ErpTags, MicroLabel, Panel, SampleBadge, Stat } from "./BoardKit";
import { TrendChart, type Tone } from "./Charts";
import { ErpFormulaPanel } from "./ErpFormulaPanel";
import { useErpEndpoint } from "./useErpEndpoint";
import { DOMAIN_LABEL, STATUS_META } from "../constants";
import { deviation, forecast, formatNumber, formatValue, ruleText } from "../services/engine";
import type { ExceptionRow, OverviewPayload, OverviewRow, StatusCode } from "../types";
import { StatusBadge } from "./StatusBadge";

type HeatLine = OverviewPayload["heat"][number];

interface BreakdownPayload {
  sample?: boolean;
  aggregationMode?: string;
  orphanRecordCount?: number;
  byUnit?: Array<{
    unitCode: string;
    unitName: string;
    site: string;
    actual: number | null;
    target: number | null;
    variancePct: number | null;
    sharePct: number | null;
  }>;
  bySite?: Array<{
    site: string;
    actual: number | null;
    target: number | null;
    variancePct: number | null;
  }>;
}

interface DriversPayload {
  sample?: boolean;
  driverSource?: string;
  drivers?: Array<{
    code: string;
    label: string;
    sharePct: number;
    impactValue: number | null;
    recordCount?: number;
  }>;
}

interface TransactionsPayload {
  sample?: boolean;
  totalRecords?: number;
  rows?: Array<{
    recordId: string;
    postedDate: string;
    unitName?: string;
    accountOrCause?: string;
    counterparty?: string;
    amount: number;
    shareOfUnitPct?: number | null;
  }>;
}

interface TargetsPayload {
  sample?: boolean;
  budgetVersion?: string;
  targets?: Array<{
    kpiKey: string;
    isSeasonal?: boolean;
    annualBaseTarget?: number | null;
    monthly?: Record<string, number> | null;
  }>;
}

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
  currency,
  exceptions,
  onOpenChange,
}: {
  row: OverviewRow | null;
  companyName: string;
  asOf: string;
  currency: CurrencyCode;
  exceptions: Array<ExceptionRow & { kpiName: string; companyName: string }>;
  heat: HeatLine[];
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState("desc");
  const [recoveryPct, setRecoveryPct] = useState(50);

  const activeKpiKey = row?.kpi.kpi_key ?? null;
  const curYear = asOf.slice(0, 4);

  const breakdown = useErpEndpoint<BreakdownPayload>(
    activeKpiKey && tab === "diag" ? "kpi-readings/breakdown" : null,
    activeKpiKey ? { kpiKey: activeKpiKey, period: asOf } : undefined,
  );
  const drivers = useErpEndpoint<DriversPayload>(
    activeKpiKey && tab === "diag" ? "kpi-readings/drivers" : null,
    activeKpiKey ? { kpiKey: activeKpiKey, period: asOf, limit: 6 } : undefined,
  );
  const transactions = useErpEndpoint<TransactionsPayload>(
    activeKpiKey && tab === "diag" ? "kpi-readings/transactions" : null,
    activeKpiKey ? { kpiKey: activeKpiKey, period: asOf, page: 1, size: 10 } : undefined,
  );
  const targets = useErpEndpoint<TargetsPayload>(
    activeKpiKey && tab === "desc" ? "kpi-targets" : null,
    activeKpiKey ? { year: curYear } : undefined,
  );

  const fc = useMemo(() => (row ? forecast(row.points, row.kpi, 3) : null), [row]);

  if (!row) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-[740px]" />
      </Sheet>
    );
  }

  const meta = STATUS_META[row.status.code];
  const dev = row.status.deviation;
  const bandPct = row.kpi.rule_type === "PCT" && row.kpi.threshold ? row.kpi.threshold / 100 : undefined;
  const unitLabel = displayUnitForCurrency(row.kpi.unit, currency);

  const fmtDisplay = (val: number | null): string => {
    if (val === null) return "—";
    const converted = convertPhpValue(val, row.kpi.unit, currency);
    if (converted === null) return "—";
    if (currency === "USD" && row.kpi.unit && (row.kpi.unit.includes("₱") || row.kpi.unit.toUpperCase().includes("PHP"))) {
      return `$${formatNumber(converted, row.kpi.dp)}`;
    }
    return formatValue(val, row.kpi);
  };

  const recent12 = row.points.slice(-12);
  const latestIdx = row.points.findLastIndex((p) => p.actual !== null);
  const prevMonth = latestIdx > 0 ? row.points[latestIdx - 1]?.actual ?? null : null;
  const lastYear = latestIdx >= 12 ? row.points[latestIdx - 12]?.actual ?? null : null;
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

  const activeException = exceptions.find((ex) => ex.kpi_id === row.kpi.id) ?? null;
  const targetRecord = targets.data?.targets?.find((t) => t.kpiKey === row.kpi.kpi_key) ?? null;

  const gap = row.actual !== null && row.target !== null ? row.actual - row.target : 0;
  const projected =
    row.actual !== null && row.target !== null && dev?.unfavorable
      ? row.actual - gap * (recoveryPct / 100)
      : row.actual;
  const projectedDev = projected !== null && row.target !== null ? deviation(row.kpi, projected, row.target) : null;

  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[740px]">
        <SheetHeader className="border-b border-border/70 bg-muted/20 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[10.5px] font-semibold uppercase tracking-wider">
              {DOMAIN_LABEL[row.kpi.domain] ?? row.kpi.domain}
            </Badge>
            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
            <ErpTags kpiKey={row.kpi.kpi_key} sourceCodes={row.kpi.source_codes} />
          </div>
          <SheetTitle className="mt-1.5 text-lg font-semibold leading-snug tracking-tight">
            {row.kpi.name}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {companyName} · <span className="font-mono">{row.kpi.kpi_key}</span> · As of {asOf} · Rule:{" "}
            {ruleText(row.kpi)}
          </SheetDescription>

          <div className="mt-3 grid grid-cols-3 gap-2.5 rounded-lg border border-border/60 bg-card p-3">
            <div>
              <MicroLabel>Actual</MicroLabel>
              <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-foreground">
                {fmtDisplay(row.actual)}
              </p>
            </div>
            <div>
              <MicroLabel>Target</MicroLabel>
              <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-muted-foreground">
                {fmtDisplay(row.target)}
              </p>
            </div>
            <div>
              <MicroLabel>Variance</MicroLabel>
              <p
                className={cn(
                  "mt-0.5 font-mono text-xl font-semibold tabular-nums",
                  dev?.unfavorable ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {dev ? dev.text : "—"}
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="desc" className="text-xs">1. Descriptive</TabsTrigger>
              <TabsTrigger value="diag" className="text-xs">2. Diagnostic</TabsTrigger>
              <TabsTrigger value="pred" className="text-xs">3. Predictive</TabsTrigger>
              <TabsTrigger value="presc" className="text-xs">4. Prescriptive</TabsTrigger>
            </TabsList>

            {/* 1. DESCRIPTIVE */}
            <TabsContent value="desc" className="mt-4 space-y-4">
              <Panel className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <MicroLabel>12-Month Trend vs Target ({unitLabel || "value"})</MicroLabel>
                  <span className="font-mono text-[11px] text-muted-foreground">{ruleText(row.kpi)}</span>
                </div>
                <TrendChart
                  points={recent12.map((p) => ({
                    period: p.period,
                    label: shortMonth(p.period),
                    actual: convertPhpValue(p.actual, row.kpi.unit, currency),
                    target: convertPhpValue(p.target, row.kpi.unit, currency),
                  }))}
                  bandPct={bandPct}
                  tone={TONE[row.status.code]}
                  height={210}
                />
              </Panel>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Panel className="p-3">
                  <Stat
                    label="vs Target"
                    value={dev ? dev.text : "—"}
                    tone={dev?.unfavorable ? "danger" : "success"}
                    note={row.target !== null ? `Tgt ${fmtDisplay(row.target)}` : "No target"}
                  />
                </Panel>
                <Panel className="p-3">
                  <Stat
                    label="vs Prior Mo."
                    value={momPct !== null ? `${momPct >= 0 ? "+" : ""}${formatNumber(momPct, 1)}%` : "—"}
                    note={prevMonth !== null ? fmtDisplay(prevMonth) : "No prior"}
                  />
                </Panel>
                <Panel className="p-3">
                  <Stat
                    label="vs Last Year"
                    value={yoyPct !== null ? `${yoyPct >= 0 ? "+" : ""}${formatNumber(yoyPct, 1)}%` : "—"}
                    note={lastYear !== null ? fmtDisplay(lastYear) : "No YoY"}
                  />
                </Panel>
                <Panel className="p-3">
                  <Stat
                    label="YTD Avg"
                    value={fmtDisplay(ytdActual)}
                    tone={ytdDev?.unfavorable ? "warning" : "success"}
                    note={ytdDev ? `${ytdDev.text} vs YTD tgt` : `${ytdPts.length}m avg`}
                  />
                </Panel>
              </div>

              {targetRecord?.monthly ? (
                <Panel className="p-4">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <MicroLabel>{curYear} Monthly Target Calendar</MicroLabel>
                    {targets.sample ? <SampleBadge /> : null}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                    {Object.entries(targetRecord.monthly).map(([m, val]) => (
                      <div
                        key={m}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-center",
                          m === asOf
                            ? "border-teal-700/50 bg-teal-700/10"
                            : "border-border/60 bg-muted/20",
                        )}
                      >
                        <p className="text-[10px] font-medium text-muted-foreground">{shortMonth(m)}</p>
                        <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums">
                          {fmtDisplay(val)}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : null}

              <ErpFormulaPanel
                kpiKey={row.kpi.kpi_key}
                sourceCodes={row.kpi.source_codes}
                period={asOf}
              />
            </TabsContent>

            {/* 2. DIAGNOSTIC */}
            <TabsContent value="diag" className="mt-4 space-y-4">
              {/* Variance Drivers Pareto */}
              <Panel className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <MicroLabel>Ranked Variance Drivers</MicroLabel>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Root-cause share contributing to current actual vs target gap.
                    </p>
                  </div>
                  {drivers.sample ? <SampleBadge /> : null}
                </div>
                {drivers.loading ? (
                  <p className="py-4 text-xs text-muted-foreground">Loading variance drivers…</p>
                ) : !drivers.available ? (
                  <p className="py-3 text-xs text-muted-foreground">
                    Driver attribution endpoint not available on this server yet.
                  </p>
                ) : drivers.data?.drivers?.length ? (
                  <div className="space-y-2.5">
                    {drivers.data.drivers.map((d) => (
                      <div key={d.code} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-foreground">{d.label}</span>
                          <span className="font-mono tabular-nums text-muted-foreground">
                            {formatNumber(d.sharePct, 1)}%
                            {d.recordCount !== undefined ? ` · ${d.recordCount} rec` : ""}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-teal-700 dark:bg-teal-400"
                            style={{ width: `${Math.min(100, Math.max(4, d.sharePct))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-2 text-xs text-muted-foreground">
                    No tagged driver reasons recorded — refer to the linked exception memo below.
                  </p>
                )}
              </Panel>

              {/* Unit & Site Breakdown */}
              <Panel className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <MicroLabel>Unit &amp; Site Breakdown</MicroLabel>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {breakdown.data?.aggregationMode === "ADDITIVE"
                        ? "Unit actuals sum to company total; each compared to its own budget share."
                        : "Unit rates compared against company target; site totals volume-weighted."}
                    </p>
                  </div>
                  {breakdown.sample ? <SampleBadge /> : null}
                </div>
                {breakdown.loading ? (
                  <p className="py-4 text-xs text-muted-foreground">Loading unit &amp; site breakdown…</p>
                ) : !breakdown.available ? (
                  <p className="py-3 text-xs text-muted-foreground">
                    Breakdown endpoint not available on this server yet.
                  </p>
                ) : breakdown.data?.byUnit?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                          <th className="py-2 pr-3">Unit</th>
                          <th className="py-2 pr-3">Site</th>
                          <th className="py-2 pr-3 text-right">Actual</th>
                          <th className="py-2 pr-3 text-right">Target</th>
                          <th className="py-2 text-right">Var.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {breakdown.data.byUnit.map((u) => (
                          <tr key={u.unitCode}>
                            <td className="py-2 pr-3 font-medium">{u.unitName}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{u.site}</td>
                            <td className="py-2 pr-3 text-right font-mono tabular-nums">{fmtDisplay(u.actual)}</td>
                            <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                              {fmtDisplay(u.target)}
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums">
                              {u.variancePct !== null ? `${u.variancePct >= 0 ? "+" : ""}${formatNumber(u.variancePct, 1)}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-2 text-xs text-muted-foreground">No unit breakdown returned for this period.</p>
                )}
              </Panel>

              {/* Role-Gated Transactions */}
              <Panel className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <MicroLabel>Underlying Transactions (Audit Drill-Down)</MicroLabel>
                  {transactions.sample ? <SampleBadge /> : null}
                </div>
                {transactions.loading ? (
                  <p className="py-3 text-xs text-muted-foreground">Checking transaction access…</p>
                ) : transactions.forbidden ? (
                  <div className="flex items-start gap-2.5 rounded-lg border border-sky-600/25 bg-sky-600/8 p-3 text-xs">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" aria-hidden />
                    <div>
                      <p className="font-semibold text-foreground">Protected · Aggregated View Only</p>
                      <p className="mt-0.5 text-muted-foreground">{transactions.error}</p>
                    </div>
                  </div>
                ) : !transactions.available ? (
                  <p className="py-2 text-xs text-muted-foreground">
                    Transaction drill-down not available on this server yet.
                  </p>
                ) : transactions.data?.rows?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                          <th className="py-2 pr-2">Record</th>
                          <th className="py-2 pr-2">Date</th>
                          <th className="py-2 pr-2">Account / Cause</th>
                          <th className="py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {transactions.data.rows.slice(0, 8).map((tx) => (
                          <tr key={tx.recordId}>
                            <td className="py-2 pr-2 font-mono text-[11px]">{tx.recordId}</td>
                            <td className="py-2 pr-2 font-mono text-[11px] text-muted-foreground">{tx.postedDate}</td>
                            <td className="py-2 pr-2">
                              <span className="font-medium">{tx.accountOrCause ?? "—"}</span>
                              {tx.counterparty ? (
                                <span className="block text-[11px] text-muted-foreground">{tx.counterparty}</span>
                              ) : null}
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums">
                              ₱{formatNumber(tx.amount, 2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-2 text-xs text-muted-foreground">No posted transaction rows for this period.</p>
                )}
              </Panel>
            </TabsContent>

            {/* 3. PREDICTIVE */}
            <TabsContent value="pred" className="mt-4 space-y-4">
              {fc && fc.enoughHistory && fc.points.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <Panel className="p-3">
                      <Stat
                        label="Next Period Forecast"
                        value={fmtDisplay(fc.points[0] ?? null)}
                        note="Month +1"
                      />
                    </Panel>
                    <Panel className="p-3">
                      <Stat
                        label="Breach Probability"
                        value={fc.breachProbability !== null ? `${formatNumber(fc.breachProbability * 100, 0)}%` : "—"}
                        tone={fc.breachProbability !== null && fc.breachProbability > 0.6 ? "danger" : "success"}
                        note={
                          fc.breachProbability !== null && fc.breachProbability > 0.6
                            ? "Forecast risk (>60%)"
                            : "Within tolerance"
                        }
                      />
                    </Panel>
                    <Panel className="p-3">
                      <Stat
                        label="Model"
                        value={fc.method}
                        note="3-month horizon"
                      />
                    </Panel>
                  </div>
                  <Panel className="p-4">
                    <MicroLabel>3-Month Forecast Trajectory</MicroLabel>
                    <div className="mt-2 space-y-2">
                      {fc.points.map((val, idx) => {
                        const half80 = fc.band80[idx] ?? 0;
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs"
                          >
                            <span className="font-mono font-semibold">Month +{idx + 1}</span>
                            <span className="font-mono text-sm font-semibold tabular-nums">{fmtDisplay(val)}</span>
                            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                              80%: {fmtDisplay(val - half80)} – {fmtDisplay(val + half80)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Panel>
                </>
              ) : (
                <Callout tone="info" title="More history needed for forecasting">
                  At least 4 monthly readings are required to compute a 3-month Holt forecast and next-period breach
                  probability.
                </Callout>
              )}
            </TabsContent>

            {/* 4. PRESCRIPTIVE */}
            <TabsContent value="presc" className="mt-4 space-y-4">
              {activeException ? (
                <Callout tone="warning" title={`Active Exception · ${activeException.status}`}>
                  <p>
                    <strong>Owner ID:</strong> {activeException.owner_user_id ?? "Unassigned"} ·{" "}
                    <strong>Due:</strong> {activeException.memo_due_date ?? "—"}
                  </p>
                  {activeException.memo ? <p className="mt-1">{activeException.memo}</p> : null}
                  <Link
                    href={`/fm/management-analytics/analytics-variance?period=${asOf}`}
                    className="mt-2 inline-block font-medium text-teal-700 underline dark:text-teal-400"
                  >
                    Manage in Variance Protocol →
                  </Link>
                </Callout>
              ) : (
                <Callout tone="success" title="No open exception on this KPI">
                  This measure does not currently require a corrective memo.
                </Callout>
              )}

              <Panel className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <MicroLabel>Recovery Sensitivity Simulator</MicroLabel>
                  <span className="font-mono text-xs font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                    {recoveryPct}% gap closure
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={recoveryPct}
                  onChange={(e) => setRecoveryPct(Number(e.target.value))}
                  className="w-full accent-teal-700"
                />
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <MicroLabel>Projected Value</MicroLabel>
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{fmtDisplay(projected)}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <MicroLabel>Projected Variance</MicroLabel>
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                      {projectedDev ? projectedDev.text : "—"}
                    </p>
                  </div>
                </div>
              </Panel>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
