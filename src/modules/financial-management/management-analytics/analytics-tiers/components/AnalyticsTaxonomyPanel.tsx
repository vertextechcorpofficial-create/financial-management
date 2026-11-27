"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Callout, ErpTags, MicroLabel, Panel, Stat } from "./BoardKit";
import { TrendChart, type Tone } from "./Charts";
import { ErpFormulaPanel } from "./ErpFormulaPanel";

import { DOMAIN_LABEL, STATUS_META } from "../constants";
import { fetchCatalogDetail } from "../providers/catalogApi";
import { deviation, formatNumber, formatValue, ruleText } from "../services/engine";
import { phtToday } from "../pht";
import type { CatalogDetail, CatalogOption, CatalogRow } from "../types";
import { OptionCombobox } from "./OptionCombobox";
import { StatusBadge } from "./StatusBadge";

const MATURITY_TIERS = [
  {
    key: "desc",
    name: "Descriptive",
    question: "What happened?",
    techniques: "Historical aggregations, executive scorecards, KPI reporting, trend variance",
    stakeholders: "Department Heads, Operations",
    bar: "bg-primary/40",
    edge: "border-t-primary/50",
  },
  {
    key: "diag",
    name: "Diagnostic",
    question: "Why did it happen?",
    techniques: "Root-cause analysis, drill-downs, correlation matrices, audit trail reviews",
    stakeholders: "QA Managers, Controllers, Business Analysts",
    bar: "bg-primary/60",
    edge: "border-t-primary/70",
  },
  {
    key: "pred",
    name: "Predictive",
    question: "What is likely to happen?",
    techniques: "Time-series forecasting, regression models, probability scoring, demand modeling",
    stakeholders: "Finance Directors, Strategic Planners",
    bar: "bg-primary/80",
    edge: "border-t-primary/85",
  },
  {
    key: "presc",
    name: "Prescriptive",
    question: "What should we do?",
    techniques: "Linear optimization, scenario modeling, sensitivity analysis, rule-based automation",
    stakeholders: "C-Suite, Executive Committees",
    bar: "bg-primary",
    edge: "border-t-primary",
  },
] as const;

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortMonth = (period: string) => {
  const [y, m] = period.split("-");
  const name = SHORT_MONTHS[Number(m) - 1];
  return name ? `${name} ${y.slice(2)}` : period;
};

const TONE: Record<string, Tone> = {
  ON_TRACK: "success",
  FAVORABLE: "info",
  WATCH: "warning",
  PROVISIONAL: "primary",
  CONFIRMED: "danger",
  NO_DATA: "muted",
};

export function AnalyticsTaxonomyPanel({
  rows,
  allOptions = [],
}: {
  rows: CatalogRow[];
  allOptions?: CatalogOption[];
}) {
  const [tierIdx, setTierIdx] = useState(0);
  const [selectedKpiId, setSelectedKpiId] = useState<string>("");
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const [loadedKpiId, setLoadedKpiId] = useState<string>("");
  const [recoveryPct, setRecoveryPct] = useState(50);

  const activeKpiId = selectedKpiId || (allOptions[0] ? String(allOptions[0].id) : rows[0] ? String(rows[0].kpi.id) : "");
  const loading = Boolean(activeKpiId) && loadedKpiId !== activeKpiId;

  useEffect(() => {
    if (!activeKpiId) return;
    let cancelled = false;
    fetchCatalogDetail(Number(activeKpiId))
      .then((res) => {
        if (!cancelled) {
          setDetail(res);
          setLoadedKpiId(activeKpiId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
          setLoadedKpiId(activeKpiId);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeKpiId]);

  const kpiOptions = useMemo(() => {
    if (allOptions.length > 0) {
      return allOptions.map((r) => ({
        value: String(r.id),
        label: `${r.companyCode || "GRP"} · ${r.name}`,
        searchText: `${r.companyCode} ${r.companyName} ${r.name} ${r.kpiKey}`,
      }));
    }
    return rows.map((r) => ({
      value: String(r.kpi.id),
      label: `${r.companyCode || "GRP"} · ${r.kpi.name}`,
      searchText: `${r.companyCode ?? ""} ${r.companyName ?? ""} ${r.kpi.name} ${r.kpi.kpi_key}`,
    }));
  }, [allOptions, rows]);

  const tier = MATURITY_TIERS[tierIdx];
  const kpi = detail?.row.kpi ?? null;
  const fc = detail?.forecast ?? null;
  const recent12 = detail?.points.slice(-12) ?? [];
  const latest = detail ? [...detail.points].reverse().find((p) => p.actual !== null) : null;
  const bandPct = kpi && kpi.rule_type === "PCT" && kpi.threshold ? kpi.threshold / 100 : undefined;

  const latestIdx = detail ? detail.points.findLastIndex((p) => p.actual !== null) : -1;
  const prevActual = detail && latestIdx > 0 ? detail.points[latestIdx - 1]?.actual ?? null : null;
  const lastYearActual = detail && latestIdx >= 12 ? detail.points[latestIdx - 12]?.actual ?? null : null;
  const rel = (a: number | null | undefined, b: number | null) =>
    a != null && b != null && b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null;
  const mom = rel(latest?.actual, prevActual);
  const yoy = rel(latest?.actual, lastYearActual);

  const gap = latest?.actual != null && latest?.target != null ? latest.actual - latest.target : 0;
  const projected =
    detail && latest?.actual != null && latest?.target != null && detail.status.deviation?.unfavorable
      ? latest.actual - gap * (recoveryPct / 100)
      : latest?.actual ?? null;
  const projDev = kpi && projected !== null && latest?.target != null ? deviation(kpi, projected, latest.target) : null;

  return (
    <div className="space-y-4">
      <div aria-hidden className="flex h-1.5 overflow-hidden rounded-full">
        {MATURITY_TIERS.map((item) => (
          <span key={item.key} className={cn("flex-1", item.bar)} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MATURITY_TIERS.map((item, idx) => {
          const active = tierIdx === idx;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() => setTierIdx(idx)}
              className={cn(
                "flex flex-col rounded-b-xl border border-border/60 border-t-[4px] bg-card p-4 text-left shadow-sm transition-colors",
                item.edge,
                active ? "bg-primary/5 ring-1 ring-inset ring-primary/40" : "hover:bg-muted/40",
              )}
            >
              <MicroLabel>Tier {idx + 1}</MicroLabel>
              <p className="mt-0.5 text-sm font-semibold">{item.name}</p>
              <p className="mt-1.5 text-lg font-semibold leading-snug tracking-tight">{item.question}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.techniques}</p>
              <p className="mt-auto pt-2.5 text-[11px] text-muted-foreground">
                <strong className="text-foreground">Stakeholders:</strong> {item.stakeholders}
              </p>
            </button>
          );
        })}
      </div>

      <Panel className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">
              Tier {tierIdx + 1} · {tier.name} —{" "}
              <span className="font-normal text-muted-foreground">{tier.question}</span>
            </h2>
            {kpi ? <ErpTags kpiKey={kpi.kpi_key} sourceCodes={kpi.source_codes} compact /> : null}
          </div>
          <div className="w-full sm:w-[280px]">
            <OptionCombobox
              value={activeKpiId}
              onChange={(val) => setSelectedKpiId(val)}
              options={kpiOptions}
              placeholder="Select KPI to inspect"
              searchPlaceholder="Search KPIs…"
              emptyLabel="No KPI found."
              aria-label="Inspect KPI"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading KPI series…
          </div>
        ) : !detail || !kpi ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Select a KPI above to inspect its tier output.</p>
        ) : (
          <>
            {tier.key === "desc" ? (
              <div className="space-y-4">
                <TrendChart
                  points={recent12}
                  dp={kpi.dp}
                  tone={TONE[detail.status.code] ?? "primary"}
                  bandPct={bandPct}
                />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Panel className="p-3">
                    <Stat
                      label="Latest vs Target"
                      value={detail.status.deviation ? detail.status.deviation.text : "—"}
                      tone={detail.status.deviation?.unfavorable ? "danger" : "success"}
                      note={latest?.target != null ? `Target ${formatValue(latest.target, kpi)}` : "No target"}
                    />
                  </Panel>
                  <Panel className="p-3">
                    <Stat
                      label="vs Prior month"
                      value={mom !== null ? `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%` : "—"}
                      note={prevActual !== null ? formatValue(prevActual, kpi) : "No prior"}
                    />
                  </Panel>
                  <Panel className="p-3">
                    <Stat
                      label="vs Last year"
                      value={yoy !== null ? `${yoy > 0 ? "+" : ""}${yoy.toFixed(1)}%` : "—"}
                      note={lastYearActual !== null ? formatValue(lastYearActual, kpi) : "No YoY"}
                    />
                  </Panel>
                  <Panel className="p-3">
                    <Stat
                      label="Status"
                      value={STATUS_META[detail.status.code].label}
                      tone={TONE[detail.status.code]}
                      note={ruleText(kpi)}
                    />
                  </Panel>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <table className="w-full min-w-[540px] text-center font-mono text-xs tabular-nums">
                    <thead>
                      <tr className="border-b border-border/50 text-[10.5px] text-muted-foreground">
                        <th className="px-2 py-1.5 text-left font-sans">Row</th>
                        {recent12.map((p) => (
                          <th key={p.period} className="px-1.5 py-1.5">
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
                            {p.target !== null ? formatNumber(p.target, kpi.dp) : "—"}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-2 py-1.5 text-left font-sans font-medium">Actual</td>
                        {recent12.map((p) => (
                          <td key={`a-${p.period}`} className="px-1.5 py-1.5">
                            {p.actual !== null ? formatNumber(p.actual, kpi.dp) : "—"}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {tier.key === "diag" ? (
              <div className="space-y-3 text-xs">
                <p className="text-muted-foreground">
                  {kpi.definition ?? "Rule evaluation, source lineage, and ownership for root-cause review."}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/60 p-3">
                    <MicroLabel>Domain &amp; Ownership</MicroLabel>
                    <p className="mt-1 font-medium">{DOMAIN_LABEL[kpi.domain] ?? kpi.domain}</p>
                    <p className="mt-0.5 text-muted-foreground">Owner: {kpi.owner_position ?? "Unassigned"}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <MicroLabel>Threshold &amp; Run Status</MicroLabel>
                    <p className="mt-1 font-mono">{ruleText(kpi)}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {detail.status.run ? detail.status.run.reason : "Currently within policy tolerance"}
                    </p>
                  </div>
                </div>
                <ErpFormulaPanel
                  kpiKey={kpi.kpi_key}
                  period={latest?.period ?? phtToday().slice(0, 7)}
                  sourceCodes={kpi.source_codes}
                />
                {kpi.domain === "WORKFORCE" ? (
                  <Callout tone="info" title="Data Privacy Act (RA 10173)">
                    WorkSync attendance records are aggregated to unit and company level to protect employee personal data.
                  </Callout>
                ) : null}
              </div>
            ) : null}

            {tier.key === "pred" ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  {fc?.enoughHistory
                    ? `${fc.method} fitted on readings through ${latest?.period ?? "latest"}.`
                    : "Needs at least 4 monthly readings to fit a time-series forecast."}
                </p>
                <TrendChart
                  points={recent12}
                  dp={kpi.dp}
                  tone={TONE[detail.status.code] ?? "primary"}
                  bandPct={bandPct}
                  forecast={fc ?? undefined}
                />
                {fc?.enoughHistory ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Panel className="p-3">
                        <Stat
                          label="Next month (+1)"
                          value={formatValue(fc.points[0], kpi)}
                          note={`80%: ${formatNumber(fc.points[0] - (fc.band80[0] ?? 0), kpi.dp)} – ${formatNumber(fc.points[0] + (fc.band80[0] ?? 0), kpi.dp)}`}
                        />
                      </Panel>
                      <Panel className="p-3">
                        <Stat
                          label="3-month outlook (+3)"
                          value={formatValue(fc.points[2] ?? fc.points[0], kpi)}
                          note={`Method: ${fc.method}`}
                        />
                      </Panel>
                      <Panel className="p-3">
                        <Stat
                          label="P(breach next period)"
                          value={`${Math.round((fc.breachProbability ?? 0) * 100)}%`}
                          tone={
                            (fc.breachProbability ?? 0) > 0.6
                              ? "danger"
                              : (fc.breachProbability ?? 0) > 0.3
                                ? "warning"
                                : "success"
                          }
                          note={`Beyond ${ruleText(kpi)}`}
                        />
                      </Panel>
                    </div>
                    {(fc.breachProbability ?? 0) > 0.6 ? (
                      <Callout tone="danger" title="High breach probability (>60%)">
                        Consider initiating preventive action before the variance confirms.
                      </Callout>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {tier.key === "presc" ? (
              <div className="space-y-4">
                <Callout tone="primary" title={`Suggested owner: ${kpi.owner_position ?? "Company General Manager"}`}>
                  {detail.status.memoRequired
                    ? "This KPI is currently in breach. File a root-cause memo in Variance Protocol and monitor post-fix readings until verified closed."
                    : "KPI is within tolerance. Use the sensitivity slider below to model impact of operational adjustments."}
                </Callout>
                <div className="rounded-lg border border-border/60 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Scenario: sensitivity analysis</p>
                      <p className="text-xs text-muted-foreground">
                        Drag to model what percentage of the variance gap is removed by remediation.
                      </p>
                    </div>
                    <Badge variant="outline" className="font-mono tabular-nums">
                      {recoveryPct}% gap removed
                    </Badge>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={recoveryPct}
                    onChange={(event) => setRecoveryPct(Number(event.target.value))}
                    aria-label="Share of variance gap removed"
                    className="w-full accent-primary"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                    <span className="font-mono tabular-nums">
                      Projected:{" "}
                      <strong>{projected !== null ? formatValue(projected, kpi) : "—"}</strong>{" "}
                      {projDev ? `(${projDev.text})` : ""}
                    </span>
                    {projDev ? (
                      <StatusBadge
                        tone={
                          projDev.over
                            ? projDev.unfavorable
                              ? "danger"
                              : "info"
                            : projDev.watch
                              ? "warning"
                              : "success"
                        }
                      >
                        {projDev.over
                          ? projDev.unfavorable
                            ? "Still over limit"
                            : "Favorable"
                          : projDev.watch
                            ? "Watch"
                            : "Within tolerance"}
                      </StatusBadge>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  );
}
