"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  Dot,
  MicroLabel,
  Panel,
  SectionHeading,
} from "@/modules/financial-management/management-analytics/shared/BoardKit";
import { Meter, Sparkline, type Tone } from "@/modules/financial-management/management-analytics/shared/Charts";

import { DOMAIN_LABEL, STATUS_META } from "../constants";
import { changeText, deviation, formatNumber, formatValue, ruleText } from "../services/engine";
import type { CompanyScorecardRow, OverviewPayload, OverviewRow, StatusCode } from "../types";
import { KpiDetailDrawer } from "./KpiDetailDrawer";
import { StatusBadge } from "./StatusBadge";

const ORDER: StatusCode[] = ["CONFIRMED", "PROVISIONAL", "WATCH", "FAVORABLE", "ON_TRACK", "NO_DATA"];

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

function buildHref(basePath: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function OverviewInteractiveSection({
  payload,
  rows,
  basePath,
  pageSize,
  status,
  isGroupView,
}: {
  payload: OverviewPayload;
  rows: OverviewRow[];
  basePath: string;
  pageSize: number;
  status?: string;
  isGroupView: boolean;
}) {
  const router = useRouter();
  const [domainFilter, setDomainFilter] = useState("ALL");
  const [drawerRow, setDrawerRow] = useState<OverviewRow | null>(null);

  const domains = useMemo(() => {
    const seen = new Set(rows.map((r) => r.kpi.domain));
    return ["ALL", ...Array.from(seen)];
  }, [rows]);

  const filteredCards = useMemo(() => {
    const list = domainFilter === "ALL" ? rows : rows.filter((r) => r.kpi.domain === domainFilter);
    return [...list].sort(
      (a, b) => ORDER.indexOf(a.status.code) - ORDER.indexOf(b.status.code) || a.kpi.name.localeCompare(b.kpi.name),
    );
  }, [rows, domainFilter]);

  const operatingCompanies = payload.companies.filter((row) => row.kind !== "GROUP" && row.kind !== "HOLDINGS");
  const staleSourceCodes = useMemo(
    () => new Set(payload.sources.filter((s) => s.stale).map((s) => s.code.toUpperCase())),
    [payload.sources],
  );

  const healthTone = (score: number | null): Tone =>
    score === null ? "muted" : score >= 75 ? "success" : score >= 55 ? "warning" : "danger";

  const companyNameFor = (row: OverviewRow): string =>
    payload.companies.find((c) => c.id === row.kpi.company_id)?.name ?? payload.company?.name ?? "Group";

  const singleCompanyMonths = useMemo(() => {
    if (isGroupView || rows.length === 0) return [];
    return rows[0].points.slice(-6).map((p) => p.period);
  }, [isGroupView, rows]);

  return (
    <>
      {isGroupView && payload.companyScorecard.length > 0 ? (
        <>
          <SectionHeading
            title="Company scorecard"
            description="Select a company row to open that company's scorecard and 6-month risk heatmap."
          />
          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[13px]">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="px-4 py-2 text-left"><MicroLabel>Company</MicroLabel></th>
                    <th className="px-3 py-2 text-left"><MicroLabel>Industry</MicroLabel></th>
                    <th className="px-3 py-2 text-right"><MicroLabel>Rev. share</MicroLabel></th>
                    <th className="min-w-[150px] px-3 py-2 text-left"><MicroLabel>Health</MicroLabel></th>
                    <th className="px-3 py-2 text-right"><MicroLabel>On track</MicroLabel></th>
                    <th className="px-3 py-2 text-right"><MicroLabel>Watch</MicroLabel></th>
                    <th className="px-3 py-2 text-right"><MicroLabel>Breach</MicroLabel></th>
                    <th className="px-3 py-2 text-right"><MicroLabel>Escalated</MicroLabel></th>
                    <th className="px-4 py-2 text-left"><MicroLabel>Top issue</MicroLabel></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {payload.companyScorecard.map((co: CompanyScorecardRow) => {
                    const tone = healthTone(co.health);
                    const targetHref = buildHref(basePath, {
                      company: co.code,
                      period: payload.asOf,
                      size: pageSize,
                      status,
                    });
                    return (
                      <tr
                        key={co.id}
                        tabIndex={0}
                        onClick={() => router.push(targetHref)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(targetHref);
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-muted/40"
                      >
                        <td className="px-4 py-2.5 font-medium">
                          <span className="inline-flex items-center gap-2">
                            <Dot tone={tone} />
                            <span>{co.name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{co.industry}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {co.revenueWeight !== null && co.revenueWeight > 0
                            ? `${Math.round(co.revenueWeight > 1 ? co.revenueWeight : co.revenueWeight * 100)}%`
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-7 font-mono text-xs tabular-nums">
                              {co.health !== null ? formatNumber(co.health, 0) : "—"}
                            </span>
                            <Meter value={co.health ?? 0} tone={tone} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-success">
                          {co.onTrack}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-warning">
                          {co.watch}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-destructive">
                          {co.breach}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                          {co.escalated}
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-2.5 text-xs text-muted-foreground">
                          {co.topIssue ? (
                            <span>
                              {co.topIssue.kpiName}{" "}
                              <span className="font-mono text-destructive">{co.topIssue.varianceText}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : null}

      {rows.length > 0 ? (
        <>
          <SectionHeading
            title={isGroupView ? "Consolidated & scoped KPI scorecard" : "KPI scorecard"}
            description={`Click any KPI card to open the 4-tier drill-down drawer (Descriptive · Diagnostic · Predictive · Prescriptive).`}
            right={
              <div className="flex flex-wrap items-center gap-1.5">
                {domains.map((dom) => (
                  <button
                    key={dom}
                    type="button"
                    onClick={() => setDomainFilter(dom)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      domainFilter === dom
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {dom === "ALL" ? `All (${rows.length})` : (DOMAIN_LABEL[dom] ?? dom)}
                  </button>
                ))}
              </div>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCards.map((row) => {
              const meta = STATUS_META[row.status.code];
              const dev = row.status.deviation;
              const kpiSources = (row.kpi.source_codes ?? "")
                .split(",")
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);
              const hasStaleFeed = kpiSources.some((code) => staleSourceCodes.has(code));
              return (
                <button
                  key={row.kpi.id}
                  type="button"
                  onClick={() => setDrawerRow(row)}
                  className="flex min-w-0 flex-col rounded-xl border border-border/60 bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-2">
                    <MicroLabel className="truncate">{DOMAIN_LABEL[row.kpi.domain] ?? row.kpi.domain}</MicroLabel>
                    <StatusBadge tone={meta.tone} title={row.status.label}>
                      {meta.label}
                    </StatusBadge>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold" title={row.kpi.name}>
                      {row.kpi.name}
                    </p>
                    {isGroupView && row.kpi.company_id === 0 ? (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        consolidated
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-1 items-end justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-2xl leading-none tabular-nums">
                        {row.actual === null ? "no reading" : formatValue(row.actual, row.kpi)}
                      </p>
                      <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                        vs Target ·{" "}
                        <span className={cn("font-mono tabular-nums", dev?.unfavorable ? "text-destructive" : "text-success")}>
                          {dev ? changeText(dev.value, row.kpi) : "n/a"}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        Target {row.target === null ? "not set" : formatValue(row.target, row.kpi)} · {ruleText(row.kpi)}
                      </p>
                    </div>
                    <span className="shrink-0">
                      <Sparkline points={row.points} tone={TONE[row.status.code]} />
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-border pt-2 text-[11px] text-muted-foreground">
                    <span className={cn("truncate", hasStaleFeed && "text-warning")}>
                      {hasStaleFeed ? "⚠ Stale source feed" : `● Period ${row.period ?? payload.asOf}`}
                    </span>
                    <span className="shrink-0 font-mono">
                      {kpiSources.length > 0 ? kpiSources.join(" · ") : "ERP"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {/* Upgraded Risk Heatmap: Group (Company × Core KPI) OR Single Company (KPI × last 6 months) */}
      {isGroupView && operatingCompanies.length > 0 && payload.heat.length > 0 ? (
        <>
          <SectionHeading
            title={`Risk heatmap — core KPIs by company, ${payload.asOf}`}
            description="Red = unfavorable · Blue = favorable · ◆ = confirmed breach. Click a company to open its scorecard."
          />
          <Panel>
            <div className="overflow-x-auto p-3">
              <table className="w-full min-w-[720px] border-separate border-spacing-1 text-[12.5px]">
                <thead>
                  <tr>
                    <th className="px-2 py-1.5 text-left"><MicroLabel>Company</MicroLabel></th>
                    {payload.heat.map((line) => (
                      <th key={line.kpiKey} className="px-2 py-1.5 text-center">
                        <MicroLabel>{line.kpiName}</MicroLabel>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {operatingCompanies.map((entity) => (
                    <tr key={entity.id}>
                      <td className="whitespace-nowrap px-2 py-1.5 font-medium">
                        <Link
                          href={buildHref(basePath, { company: entity.code, period: payload.asOf, size: pageSize, status })}
                          className="hover:text-primary hover:underline"
                        >
                          {entity.name}
                        </Link>
                      </td>
                      {payload.heat.map((line) => {
                        const cell = line.cells.find((entry) => entry.code === entity.code);
                        if (!cell || cell.status === "NO_DATA") {
                          return (
                            <td key={`${entity.id}-${line.kpiKey}`} className="rounded bg-muted/40 px-2 py-1.5 text-center font-mono text-xs text-muted-foreground">
                              —
                            </td>
                          );
                        }
                        const toneClass =
                          cell.status === "CONFIRMED"
                            ? "bg-destructive/80 text-destructive-foreground font-semibold"
                            : cell.unfavorable
                              ? "bg-destructive/20 text-destructive"
                              : cell.status === "FAVORABLE"
                                ? "bg-info/25 text-info font-medium"
                                : "bg-muted/60 text-foreground";
                        return (
                          <td
                            key={`${entity.id}-${line.kpiKey}`}
                            className={cn("rounded px-2 py-1.5 text-center font-mono text-xs tabular-nums", toneClass)}
                            title={`${entity.name} · ${line.kpiName}: ${STATUS_META[cell.status].label}`}
                          >
                            {cell.confirmed ? "◆ " : ""}
                            {cell.varianceText ?? STATUS_META[cell.status].label}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : !isGroupView && singleCompanyMonths.length > 0 ? (
        <>
          <SectionHeading
            title={`Risk heatmap — ${payload.company?.name ?? "Company"}, 6 months to ${payload.asOf}`}
            description="Red = unfavorable · Blue = favorable · Click any KPI row to open its 4-tier drill-down."
          />
          <Panel>
            <div className="overflow-x-auto p-3">
              <table className="w-full min-w-[680px] border-separate border-spacing-1 text-[12.5px]">
                <thead>
                  <tr>
                    <th className="px-2 py-1.5 text-left"><MicroLabel>KPI</MicroLabel></th>
                    {singleCompanyMonths.map((period) => (
                      <th key={period} className="px-2 py-1.5 text-center">
                        <MicroLabel>{shortMonth(period)}</MicroLabel>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.kpi.id}
                      onClick={() => setDrawerRow(row)}
                      className="cursor-pointer hover:bg-muted/30"
                    >
                      <td className="px-2 py-1.5 font-medium">{row.kpi.name}</td>
                      {row.points.slice(-6).map((pt) => {
                        if (pt.actual === null || pt.target === null) {
                          return (
                            <td key={`${row.kpi.id}-${pt.period}`} className="rounded bg-muted/40 px-2 py-1.5 text-center font-mono text-xs text-muted-foreground">
                              —
                            </td>
                          );
                        }
                        const d = deviation(row.kpi, pt.actual, pt.target);
                        const cls =
                          d.over && d.unfavorable
                            ? "bg-destructive/80 text-destructive-foreground font-semibold"
                            : d.unfavorable
                              ? "bg-destructive/20 text-destructive"
                              : d.over
                                ? "bg-info/25 text-info font-medium"
                                : "bg-muted/60 text-foreground";
                        return (
                          <td
                            key={`${row.kpi.id}-${pt.period}`}
                            className={cn("rounded px-2 py-1.5 text-center font-mono text-xs tabular-nums", cls)}
                          >
                            {d.over && d.unfavorable ? "◆ " : ""}
                            {d.text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : null}

      <KpiDetailDrawer
        row={drawerRow}
        companyName={drawerRow ? companyNameFor(drawerRow) : ""}
        asOf={payload.asOf}
        onOpenChange={(open) => {
          if (!open) setDrawerRow(null);
        }}
      />
    </>
  );
}
