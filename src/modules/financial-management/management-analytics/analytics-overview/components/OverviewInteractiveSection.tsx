"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Layers,
  Radio,
  Search,
  ShieldCheck,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  COMPANY_PARAM,
  COMPARE_PARAM,
  CURRENCY_PARAM,
  PERIOD_PARAM,
  convertPhpValue,
  writePersistedMaFilters,
  type CompareMode,
  type CurrencyCode,
} from "./analytics-screens";
import { Callout, Dot, ErpTags, MicroLabel, Panel, PanelHead } from "./BoardKit";
import { Meter, Sparkline, type Tone } from "./Charts";
import { OverviewFinancialBento } from "./OverviewFinancialBento";
import { DOMAIN_LABEL, STATUS_META } from "../constants";
import { changeText, deviation, formatNumber, formatValue, ruleText } from "../services/engine";
import type { OverviewPayload, OverviewRow, StatusCode } from "../types";
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

const CARD_ACCENT: Record<StatusCode, string> = {
  ON_TRACK: "border-l-emerald-500 hover:border-emerald-500/50",
  FAVORABLE: "border-l-sky-500 hover:border-sky-500/50",
  WATCH: "border-l-amber-500 hover:border-amber-500/50",
  PROVISIONAL: "border-l-teal-500 hover:border-teal-500/50",
  CONFIRMED: "border-l-rose-500 hover:border-rose-500/50",
  NO_DATA: "border-l-slate-300 dark:border-l-slate-700",
};

const HEAT_CELL: Record<StatusCode, string> = {
  ON_TRACK: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300",
  FAVORABLE: "bg-sky-500/12 text-sky-800 dark:text-sky-300",
  WATCH: "bg-amber-500/16 text-amber-800 dark:text-amber-300",
  PROVISIONAL: "bg-teal-500/16 text-teal-800 dark:text-teal-300",
  CONFIRMED: "bg-rose-500/18 font-semibold text-rose-800 dark:text-rose-300",
  NO_DATA: "bg-muted/40 text-muted-foreground",
};

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortMonth(period: string): string {
  const [y, m] = period.split("-");
  const name = SHORT_MONTHS[Number(m) - 1];
  return name ? `${name} ${y.slice(2)}` : period;
}

function MiniHealthArc({ score }: { score: number | null }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  const offset = c - (pct / 100) * c;
  const stroke =
    score === null
      ? "stroke-muted-foreground/30"
      : score >= 75
        ? "stroke-emerald-500"
        : score >= 55
          ? "stroke-amber-500"
          : "stroke-rose-500";

  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      <svg className="h-14 w-14 -rotate-90" viewBox="0 0 58 58" aria-hidden>
        <circle cx="29" cy="29" r={r} className="fill-none stroke-muted" strokeWidth="5" />
        <circle
          cx="29"
          cy="29"
          r={r}
          className={cn("fill-none transition-all duration-500", stroke)}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute font-mono text-sm font-bold tabular-nums text-foreground">
        {score !== null ? score : "—"}
      </span>
    </div>
  );
}

export function OverviewInteractiveSection({
  payload,
  rows,
  basePath,
  isGroupView,
}: {
  payload: OverviewPayload;
  rows: OverviewRow[];
  basePath: string;
  isGroupView: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const compare = (search.get(COMPARE_PARAM) ?? "target") as CompareMode;
  const currency = (search.get(CURRENCY_PARAM) === "USD" ? "USD" : "PHP") as CurrencyCode;

  const [domainFilter, setDomainFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusCode | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [entityPopoverOpen, setEntityPopoverOpen] = useState(false);
  const [entitySearch, setEntitySearch] = useState("");
  const [drawerRow, setDrawerRow] = useState<OverviewRow | null>(null);

  const activeSelection = isGroupView ? "ALL" : (payload.company?.code ?? "ALL");
  const staleSources = payload.sources.filter((s) => s.stale);
  const freshSources = payload.sources.length - staleSources.length;
  const escalatedCount = payload.exceptions.filter((ex) => ex.status === "ESCALATED").length;

  const scored = payload.rows.filter((r) => r.status.code !== "NO_DATA");
  const healthScore =
    scored.length > 0
      ? Math.round(
          (scored.reduce((sum, r) => {
            if (r.status.code === "ON_TRACK" || r.status.code === "FAVORABLE") return sum + 1;
            if (r.status.code === "WATCH") return sum + 0.6;
            if (r.status.code === "PROVISIONAL") return sum + 0.45;
            return sum;
          }, 0) /
            scored.length) *
            100,
        )
      : null;

  const handleCompanySelect = (nextCode: string) => {
    writePersistedMaFilters({ company: nextCode });
    const params = new URLSearchParams(search.toString());
    if (nextCode === "ALL") {
      params.set(COMPANY_PARAM, "ALL");
    } else {
      params.set(COMPANY_PARAM, nextCode);
    }
    if (!params.get(PERIOD_PARAM)) params.set(PERIOD_PARAM, payload.asOf);
    router.push(`${basePath}?${params.toString()}`);
  };

  const domains = useMemo(() => {
    const seen = new Set(rows.map((r) => r.kpi.domain));
    return ["ALL", ...Array.from(seen)];
  }, [rows]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows
      .filter((r) => (domainFilter === "ALL" ? true : r.kpi.domain === domainFilter))
      .filter((r) => {
        if (statusFilter === "ALL") return true;
        if (statusFilter === "ON_TRACK") return r.status.code === "ON_TRACK" || r.status.code === "FAVORABLE";
        if (statusFilter === "WATCH") return r.status.code === "WATCH" || r.status.code === "PROVISIONAL";
        return r.status.code === statusFilter;
      })
      .filter((r) => (!q ? true : r.kpi.name.toLowerCase().includes(q) || r.kpi.kpi_key.toLowerCase().includes(q)))
      .sort((a, b) => ORDER.indexOf(a.status.code) - ORDER.indexOf(b.status.code) || a.kpi.name.localeCompare(b.kpi.name));
  }, [rows, domainFilter, statusFilter, searchQuery]);

  const singleCompanyMonths = useMemo(() => {
    if (rows.length === 0) return [];
    return rows[0].points.slice(-6).map((p) => p.period);
  }, [rows]);

  const formatMetric = (val: number | null, row: OverviewRow): string => {
    if (val === null) return "—";
    if (currency === "USD" && row.kpi.unit && (row.kpi.unit.includes("₱") || row.kpi.unit.toUpperCase().includes("PHP"))) {
      const converted = convertPhpValue(val, row.kpi.unit, currency);
      if (converted !== null) {
        const suffix = row.kpi.unit.includes("M") ? "M" : row.kpi.unit.includes("/box") ? "/box" : "";
        return `$${formatNumber(converted, row.kpi.dp)}${suffix}`;
      }
    }
    return formatValue(val, row.kpi);
  };

  const compareDisplay = (row: OverviewRow) => {
    const latestIdx = row.points.findLastIndex((p) => p.actual !== null);
    const prevMonth = latestIdx > 0 ? row.points[latestIdx - 1]?.actual ?? null : null;
    const lastYear = latestIdx >= 12 ? row.points[latestIdx - 12]?.actual ?? null : null;

    if (compare === "mom") {
      if (row.actual === null || prevMonth === null || prevMonth === 0) return { label: "MoM", text: "—", bad: false };
      const pct = ((row.actual - prevMonth) / Math.abs(prevMonth)) * 100;
      const bad = row.kpi.polarity === "LOW" ? pct > 0 : pct < 0;
      return { label: "MoM", text: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`, bad };
    }
    if (compare === "yoy") {
      if (row.actual === null || lastYear === null || lastYear === 0) return { label: "YoY", text: "—", bad: false };
      const pct = ((row.actual - lastYear) / Math.abs(lastYear)) * 100;
      const bad = row.kpi.polarity === "LOW" ? pct > 0 : pct < 0;
      return { label: "YoY", text: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`, bad };
    }
    if (compare === "ytd") {
      const yr = payload.asOf.slice(0, 4);
      const pts = row.points.filter((p) => p.period.startsWith(yr) && p.actual !== null);
      const avgA = pts.length > 0 ? pts.reduce((s, p) => s + (p.actual ?? 0), 0) / pts.length : null;
      const tPts = pts.filter((p) => p.target !== null);
      const avgT = tPts.length > 0 ? tPts.reduce((s, p) => s + (p.target ?? 0), 0) / tPts.length : null;
      if (avgA === null || avgT === null) return { label: "YTD", text: "—", bad: false };
      const d = deviation(row.kpi, avgA, avgT);
      return { label: "YTD", text: changeText(d.value, row.kpi), bad: d.unfavorable };
    }

    const dev = row.status.deviation;
    return { label: "vs Tgt", text: dev ? changeText(dev.value, row.kpi) : "—", bad: dev?.unfavorable ?? false };
  };

  const onTrackCount = (payload.counts.ON_TRACK ?? 0) + (payload.counts.FAVORABLE ?? 0);
  const watchCount = (payload.counts.WATCH ?? 0) + (payload.counts.PROVISIONAL ?? 0);
  const breachCount = payload.counts.CONFIRMED ?? 0;
  const totalKpis = Math.max(1, rows.length);

  // Build entity summary rows for the "All (Group)" view directly from real company_list entities
  const entitySummaries = useMemo(() => {
    const worstIssue = rows
      .filter((r) => r.status.deviation?.unfavorable)
      .sort((a, b) => Math.abs(b.status.deviation?.ratio ?? 0) - Math.abs(a.status.deviation?.ratio ?? 0))[0];

    return payload.companies.map((c) => {
      const isMen2 = c.code.toUpperCase() === "MEN2";
      return {
        company: c,
        live: isMen2,
        kpiCount: isMen2 ? rows.length : 0,
        health: isMen2 ? healthScore : null,
        onTrack: isMen2 ? onTrackCount : 0,
        watch: isMen2 ? watchCount : 0,
        breach: isMen2 ? breachCount : 0,
        escalated: isMen2 ? escalatedCount : 0,
        topIssue: isMen2 && worstIssue ? { name: worstIssue.kpi.name, delta: worstIssue.status.deviation?.text ?? "" } : null,
      };
    });
  }, [payload.companies, rows, healthScore, onTrackCount, watchCount, breachCount, escalatedCount]);

  return (
    <div className="space-y-5">
      {/* Compact Header + Entity Scope Selector Bar (All + real active companies) */}
      <div className="flex flex-col gap-3 rounded-xl border border-border/75 bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {isGroupView ? "Group Overview" : (payload.company?.name ?? "Entity Overview")}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {isGroupView
                  ? `1 of ${payload.companies.length} entities live · ${rows.length} ERP KPIs`
                  : `${rows.length} Live ERP KPIs`}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isGroupView
                ? `Consolidated summary across ${payload.companies.length} active entities in company_list for ${shortMonth(payload.asOf)}.`
                : `${payload.company?.industry ?? "Operating Entity"} · As of ${shortMonth(payload.asOf)}. Click any KPI to drill across all four analytics tiers.`}
            </p>
          </div>
          <span className="rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-muted-foreground">
            {payload.asOf}
          </span>
        </div>

        {/* Single-Row Pinned Entity Strip + Visual 2-Column Entity Grid Popover */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleCompanySelect("ALL")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                activeSelection === "ALL"
                  ? "border-teal-700 bg-teal-700 text-white shadow-xs dark:border-teal-400 dark:bg-teal-400 dark:text-slate-950"
                  : "border-border/70 bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              <Layers className="h-3.5 w-3.5" aria-hidden />
              All Companies
              <span
                className={cn(
                  "rounded px-1.5 font-mono text-[10px]",
                  activeSelection === "ALL"
                    ? "bg-white/20 text-white dark:bg-slate-950/20 dark:text-slate-950"
                    : "bg-muted",
                )}
              >
                {payload.companies.length}
              </span>
            </button>

            {(() => {
              const MAX_INLINE_COMPANIES = 10;
              // Sort live ERP entities first, then alphabetically; always keep the selected company visible inline
              const ordered = [...payload.companies].sort((a, b) => {
                const aLive = a.code.toUpperCase() === "MEN2" ? 0 : 1;
                const bLive = b.code.toUpperCase() === "MEN2" ? 0 : 1;
                if (aLive !== bLive) return aLive - bLive;
                return a.code.localeCompare(b.code);
              });

              let visible = ordered.slice(0, MAX_INLINE_COMPANIES);
              const activeUpper = activeSelection.toUpperCase();
              if (
                activeUpper !== "ALL" &&
                !visible.some((c) => c.code.toUpperCase() === activeUpper)
              ) {
                const selectedItem = ordered.find((c) => c.code.toUpperCase() === activeUpper);
                if (selectedItem) {
                  visible = [...visible.slice(0, MAX_INLINE_COMPANIES - 1), selectedItem];
                }
              }
              const restCount = Math.max(0, ordered.length - visible.length);

              return (
                <>
                  {visible.map((c) => {
                    const selected = activeSelection.toUpperCase() === c.code.toUpperCase();
                    const isLive = c.code.toUpperCase() === "MEN2";
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => handleCompanySelect(c.code)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                          selected
                            ? "border-slate-900 bg-slate-900 text-white shadow-xs dark:border-teal-400 dark:bg-teal-400 dark:text-slate-950"
                            : "border-border/70 bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn("h-2 w-2 rounded-full", isLive ? "bg-emerald-500" : "bg-slate-400/60")}
                        />
                        <span className="font-mono text-[11px] font-semibold">{c.code}</span>
                        <span className="max-w-[140px] truncate">{c.name}</span>
                      </button>
                    );
                  })}

                  {restCount > 0 ? (
                  <Popover open={entityPopoverOpen} onOpenChange={setEntityPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-teal-700/40 hover:bg-muted/60"
                      >
                        <Building2 className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" aria-hidden />
                        <span>+{restCount} more</span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[460px] max-w-[92vw] p-0">
                      <div className="border-b border-border/60 p-3">
                        <div className="flex items-center justify-between gap-2 pb-2">
                          <MicroLabel>Switch Entity ({payload.companies.length} active)</MicroLabel>
                          <button
                            type="button"
                            onClick={() => {
                              handleCompanySelect("ALL");
                              setEntityPopoverOpen(false);
                            }}
                            className="text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-400"
                          >
                            Reset to All (Group)
                          </button>
                        </div>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            value={entitySearch}
                            onChange={(e) => setEntitySearch(e.target.value)}
                            placeholder="Filter by code or company name…"
                            className="h-8 pl-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="max-h-[320px] space-y-3 overflow-y-auto p-3">
                        {(() => {
                          const q = entitySearch.trim().toLowerCase();
                          const matches = entitySummaries.filter(
                            (e) =>
                              !q ||
                              e.company.code.toLowerCase().includes(q) ||
                              e.company.name.toLowerCase().includes(q),
                          );
                          const liveList = matches.filter((e) => e.live);
                          const pendingList = matches.filter((e) => !e.live);

                          if (matches.length === 0) {
                            return (
                              <p className="py-6 text-center text-xs text-muted-foreground">
                                No matching company found.
                              </p>
                            );
                          }

                          const renderCard = (item: (typeof entitySummaries)[number]) => {
                            const selected = activeSelection.toUpperCase() === item.company.code.toUpperCase();
                            return (
                              <button
                                key={item.company.code}
                                type="button"
                                onClick={() => {
                                  handleCompanySelect(item.company.code);
                                  setEntityPopoverOpen(false);
                                }}
                                className={cn(
                                  "flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all",
                                  selected
                                    ? "border-teal-700 bg-teal-700/8 dark:border-teal-400 dark:bg-teal-400/12"
                                    : "border-border/65 bg-card hover:border-foreground/30 hover:bg-muted/40",
                                )}
                              >
                                <div
                                  className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-[10.5px] font-bold",
                                    item.live
                                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                      : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {item.company.code.slice(0, 4)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-semibold text-foreground">{item.company.name}</p>
                                  <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                                    <span
                                      className={cn(
                                        "h-1.5 w-1.5 rounded-full",
                                        item.live ? "bg-emerald-500" : "bg-slate-400/60",
                                      )}
                                    />
                                    {item.live
                                      ? `Live · ${item.kpiCount} KPIs${item.health !== null ? ` · Health ${item.health}` : ""}`
                                      : "Pending ERP rollout"}
                                  </p>
                                </div>
                                {selected ? (
                                  <Check className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" />
                                ) : null}
                              </button>
                            );
                          };

                          return (
                            <>
                              {liveList.length > 0 ? (
                                <div className="space-y-1.5">
                                  <MicroLabel>Live ERP Connected ({liveList.length})</MicroLabel>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {liveList.map(renderCard)}
                                  </div>
                                </div>
                              ) : null}
                              {pendingList.length > 0 ? (
                                <div className="space-y-1.5">
                                  <MicroLabel>Pending ERP Rollout ({pendingList.length})</MicroLabel>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {pendingList.map(renderCard)}
                                  </div>
                                </div>
                              ) : null}
                            </>
                          );
                        })()}
                      </div>
                    </PopoverContent>
                  </Popover>
                  ) : null}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* 4 Signature Executive Summary Cards (distinct visual accents + embedded mini charts) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Health Index with Radial Arc */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/75 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card p-4 shadow-2xs">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <MicroLabel>{isGroupView ? "Group Health" : "Entity Health"}</MicroLabel>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-foreground">
              {healthScore === null
                ? "Awaiting scores"
                : healthScore >= 75
                  ? "Healthy posture"
                  : healthScore >= 55
                    ? "Watch required"
                    : "Action required"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {scored.length} scored ERP {scored.length === 1 ? "measure" : "measures"}
            </p>
          </div>
          <MiniHealthArc score={healthScore} />
        </div>

        {/* Card 2: KPI Compliance Mix with Interactive Segmented Bar */}
        <div className="flex flex-col justify-between rounded-xl border border-border/75 bg-gradient-to-br from-teal-500/[0.06] via-card to-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" aria-hidden />
              <MicroLabel>KPI Compliance Mix</MicroLabel>
            </div>
            <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
              {onTrackCount}/{rows.length}
            </span>
          </div>
          <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {onTrackCount > 0 ? (
              <div className="h-full bg-emerald-500" style={{ width: `${(onTrackCount / totalKpis) * 100}%` }} />
            ) : null}
            {watchCount > 0 ? (
              <div className="h-full bg-amber-500" style={{ width: `${(watchCount / totalKpis) * 100}%` }} />
            ) : null}
            {breachCount > 0 ? (
              <div className="h-full bg-rose-500" style={{ width: `${(breachCount / totalKpis) * 100}%` }} />
            ) : null}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => setStatusFilter((p) => (p === "ON_TRACK" ? "ALL" : "ON_TRACK"))}
              className={cn(
                "inline-flex items-center gap-1 font-medium transition-opacity",
                statusFilter === "ON_TRACK" ? "underline text-emerald-700 dark:text-emerald-300" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {onTrackCount} On track
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter((p) => (p === "WATCH" ? "ALL" : "WATCH"))}
              className={cn(
                "inline-flex items-center gap-1 font-medium transition-opacity",
                statusFilter === "WATCH" ? "underline text-amber-700 dark:text-amber-300" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              {watchCount} Watch
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter((p) => (p === "CONFIRMED" ? "ALL" : "CONFIRMED"))}
              className={cn(
                "inline-flex items-center gap-1 font-medium transition-opacity",
                statusFilter === "CONFIRMED" ? "underline text-rose-700 dark:text-rose-300" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              {breachCount} Breach
            </button>
          </div>
        </div>

        {/* Card 3: Exceptions & Escalations */}
        <Link
          href={`/fm/management-analytics/analytics-variance?period=${payload.asOf}`}
          className={cn(
            "group flex flex-col justify-between rounded-xl border border-border/75 p-4 shadow-2xs transition-colors",
            escalatedCount > 0 || breachCount > 0
              ? "bg-gradient-to-br from-rose-500/[0.07] via-card to-card hover:border-rose-500/40"
              : "bg-gradient-to-br from-sky-500/[0.06] via-card to-card hover:border-sky-500/40",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertTriangle
                className={cn(
                  "h-3.5 w-3.5",
                  escalatedCount > 0 || breachCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-sky-600 dark:text-sky-400",
                )}
                aria-hidden
              />
              <MicroLabel>Exceptions &amp; SLAs</MicroLabel>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {payload.exceptions.length}
            </span>
            <span className="text-xs text-muted-foreground">
              open ·{" "}
              <strong className={escalatedCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}>
                {escalatedCount} escalated
              </strong>
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {payload.exceptions.length > 0 ? "Open Variance Protocol to file memos" : "No overdue variance memos"}
          </p>
        </Link>

        {/* Card 4: Live Feed Freshness */}
        <Link
          href={`/fm/management-analytics/analytics-data?period=${payload.asOf}`}
          className={cn(
            "group flex flex-col justify-between rounded-xl border border-border/75 p-4 shadow-2xs transition-colors",
            staleSources.length > 0
              ? "bg-gradient-to-br from-amber-500/[0.07] via-card to-card hover:border-amber-500/40"
              : "bg-gradient-to-br from-indigo-500/[0.05] via-card to-card hover:border-indigo-500/40",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Radio
                className={cn(
                  "h-3.5 w-3.5",
                  staleSources.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-indigo-600 dark:text-indigo-400",
                )}
                aria-hidden
              />
              <MicroLabel>Data Freshness</MicroLabel>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {freshSources}/{payload.sources.length}
            </span>
            <span className="text-xs text-muted-foreground">feeds within SLA</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {staleSources.length > 0
              ? `${staleSources.map((s) => s.code).join(", ")} past SLA`
              : "All connected feeds reporting fresh"}
          </p>
        </Link>
      </div>

      {/* GROUP VIEW ONLY: Full-Width Entity Scorecard Summary Table */}
      {isGroupView ? (
        <Panel>
          <PanelHead
            title="Group Entity Scorecard"
            description="Every active entity registered in company_list. Click any row to isolate that company's KPIs and diagnostics."
            count={`${entitySummaries.length} entities`}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-muted/25 text-left">
                  <th className="px-5 py-2.5"><MicroLabel>Entity</MicroLabel></th>
                  <th className="px-3 py-2.5"><MicroLabel>ERP Feed</MicroLabel></th>
                  <th className="min-w-[160px] px-3 py-2.5"><MicroLabel>Health Score</MicroLabel></th>
                  <th className="px-3 py-2.5 text-center"><MicroLabel>On Track</MicroLabel></th>
                  <th className="px-3 py-2.5 text-center"><MicroLabel>Watch</MicroLabel></th>
                  <th className="px-3 py-2.5 text-center"><MicroLabel>Breach</MicroLabel></th>
                  <th className="px-5 py-2.5"><MicroLabel>Top Variance</MicroLabel></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {entitySummaries.map((item) => {
                  const hTone: Tone =
                    item.health === null ? "muted" : item.health >= 75 ? "success" : item.health >= 55 ? "warning" : "danger";
                  return (
                    <tr
                      key={item.company.code}
                      onClick={() => handleCompanySelect(item.company.code)}
                      className="cursor-pointer transition-colors hover:bg-muted/40"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold",
                              item.live
                                ? "bg-teal-700/12 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {item.company.code.slice(0, 3)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{item.company.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {item.company.code} · {item.company.industry ?? "Operating Entity"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {item.live ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Live · {item.kpiCount} KPIs
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <Building2 className="h-3 w-3" aria-hidden />
                            Pending ERP rollout
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {item.health !== null ? (
                          <div className="flex items-center gap-2.5">
                            <span className="w-7 font-mono text-xs font-semibold tabular-nums">{item.health}</span>
                            <Meter value={item.health} tone={hTone} />
                          </div>
                        ) : (
                          <span className="font-mono text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-block min-w-[26px] rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                          {item.live ? item.onTrack : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-block min-w-[26px] rounded-md bg-amber-500/10 px-2 py-0.5 font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                          {item.live ? item.watch : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-block min-w-[26px] rounded-md bg-rose-500/10 px-2 py-0.5 font-mono font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                          {item.live ? item.breach : "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {item.topIssue ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="max-w-[160px] truncate font-medium text-foreground">
                              {item.topIssue.name}
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                              {item.topIssue.delta}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {/* Asymmetric 8/4 Executive Bento: KPI Scorecard + Financial Intelligence Rail */}
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/75 bg-card p-1">
              {domains.map((dom) => (
                <button
                  key={dom}
                  type="button"
                  onClick={() => setDomainFilter(dom)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    domainFilter === dom
                      ? "bg-teal-700 text-white shadow-2xs dark:bg-teal-400 dark:text-slate-950"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {dom === "ALL" ? `All KPIs (${rows.length})` : (DOMAIN_LABEL[dom] ?? dom)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {statusFilter !== "ALL" ? (
                <button
                  type="button"
                  onClick={() => setStatusFilter("ALL")}
                  className="rounded-lg border border-teal-700/30 bg-teal-700/10 px-2.5 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-700/20 dark:text-teal-300"
                >
                  {STATUS_META[statusFilter].label} ×
                </button>
              ) : null}
              <div className="relative w-[190px]">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search KPI…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <Callout tone="info" title={`No live ERP KPIs returned for ${payload.company?.name ?? activeSelection}`}>
              This entity is active in <code className="font-mono text-[11px]">company_list</code>, but its ERP server
              is not yet publishing Management Analytics readings. Switch to <strong>All Companies</strong> or{" "}
              <strong>MEN2</strong> to view live metrics.
            </Callout>
          ) : filteredCards.length === 0 ? (
            <Panel className="p-8 text-center text-sm text-muted-foreground">
              No KPIs match the active filter.{" "}
              <button
                type="button"
                onClick={() => {
                  setDomainFilter("ALL");
                  setStatusFilter("ALL");
                  setSearchQuery("");
                }}
                className="font-medium text-teal-700 underline dark:text-teal-400"
              >
                Reset filters
              </button>
            </Panel>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {filteredCards.map((row) => {
                const meta = STATUS_META[row.status.code];
                const cmp = compareDisplay(row);
                const sparkPoints = row.points.slice(-12).map((p) => ({
                  period: p.period,
                  label: shortMonth(p.period),
                  actual: convertPhpValue(p.actual, row.kpi.unit, currency),
                  target: convertPhpValue(p.target, row.kpi.unit, currency),
                }));
                return (
                  <button
                    key={row.kpi.id}
                    type="button"
                    onClick={() => setDrawerRow(row)}
                    className={cn(
                      "group flex flex-col rounded-xl border border-l-[3px] border-border/75 bg-card p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-md",
                      CARD_ACCENT[row.status.code],
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <MicroLabel className="truncate">{DOMAIN_LABEL[row.kpi.domain] ?? row.kpi.domain}</MicroLabel>
                      <div className="flex items-center gap-1.5">
                        <ErpTags kpiKey={row.kpi.kpi_key} sourceCodes={row.kpi.source_codes} compact />
                        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                      </div>
                    </div>

                    <h3 className="mt-1.5 truncate text-[14.5px] font-semibold tracking-tight text-foreground">
                      {row.kpi.name}
                    </h3>

                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="font-mono text-[26px] font-bold leading-none tracking-tight tabular-nums text-foreground">
                          {formatMetric(row.actual, row)}
                        </p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums",
                              cmp.text === "—"
                                ? "bg-muted text-muted-foreground"
                                : cmp.bad
                                  ? "bg-rose-500/12 text-rose-700 dark:text-rose-400"
                                  : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
                            )}
                          >
                            {cmp.text}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{cmp.label}</span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        <Sparkline points={sparkPoints} tone={TONE[row.status.code]} />
                      </div>
                    </div>

                    <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
                      <span className="truncate font-mono">
                        Tgt {formatMetric(row.target, row)} · {ruleText(row.kpi)}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-teal-700 opacity-75 transition-opacity group-hover:opacity-100 dark:text-teal-400">
                        4 tiers
                        <ArrowUpRight className="h-3 w-3" aria-hidden />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4 xl:col-span-4">
          <OverviewFinancialBento asOf={payload.asOf} />

          <Panel>
            <PanelHead
              title="Exception Pulse"
              description="Open & escalated memos requiring action."
              count={payload.exceptions.length}
              right={
                <Link
                  href={`/fm/management-analytics/analytics-variance?period=${payload.asOf}`}
                  className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                >
                  Open protocol →
                </Link>
              }
            />
            <div className="p-4">
              {payload.exceptions.length === 0 ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-emerald-600/25 bg-emerald-600/8 p-3 text-xs">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  <span className="font-medium text-foreground">All clear — no open exceptions for this scope.</span>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {payload.exceptions.slice(0, 5).map((ex) => (
                    <Link
                      key={ex.id}
                      href={`/fm/management-analytics/analytics-variance?period=${payload.asOf}`}
                      className="flex items-start justify-between gap-2 py-2.5 text-xs transition-colors hover:text-teal-700"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{ex.kpiName}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Due {ex.memo_due_date ?? "—"} · {ex.period_end}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-500/12 px-2 py-0.5 text-[10.5px] font-semibold text-rose-700 dark:text-rose-400">
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        {ex.status}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </aside>
      </div>

      {/* Full-Width 6-Month Variance Heatmap */}
      {rows.length > 0 && singleCompanyMonths.length > 0 ? (
        <Panel>
          <PanelHead
            title="6-Month Variance Heatmap"
            description="Month-by-month performance against target. Click any KPI row to open its 4-tier diagnostic drawer."
            count={`${rows.length} KPIs`}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-muted/25">
                  <th className="px-5 py-2.5 text-left">
                    <MicroLabel>Measure</MicroLabel>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <MicroLabel>Domain</MicroLabel>
                  </th>
                  {singleCompanyMonths.map((m) => (
                    <th key={m} className="px-2.5 py-2.5 text-center font-mono text-[11px] font-semibold text-muted-foreground">
                      {shortMonth(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((row) => {
                  const last6 = row.points.slice(-6);
                  return (
                    <tr
                      key={row.kpi.id}
                      onClick={() => setDrawerRow(row)}
                      className="cursor-pointer transition-colors hover:bg-muted/35"
                    >
                      <td className="px-5 py-2.5 font-medium text-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Dot tone={TONE[row.status.code]} />
                          <span>{row.kpi.name}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {DOMAIN_LABEL[row.kpi.domain] ?? row.kpi.domain}
                      </td>
                      {last6.map((pt) => {
                        const dev = pt.actual !== null && pt.target !== null ? deviation(row.kpi, pt.actual, pt.target) : null;
                        const cellCode: StatusCode =
                          pt.actual === null
                            ? "NO_DATA"
                            : !dev
                              ? "ON_TRACK"
                              : dev.over
                                ? dev.unfavorable
                                  ? "CONFIRMED"
                                  : "FAVORABLE"
                                : dev.watch
                                  ? "WATCH"
                                  : "ON_TRACK";
                        return (
                          <td key={pt.period} className="px-1.5 py-2 text-center">
                            <span
                              className={cn(
                                "inline-block min-w-[60px] rounded-md px-2 py-1 font-mono text-[11px] tabular-nums",
                                HEAT_CELL[cellCode],
                              )}
                            >
                              {dev ? dev.text : pt.actual !== null ? formatMetric(pt.actual, row) : "—"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <KpiDetailDrawer
        row={drawerRow}
        companyName={isGroupView ? "Group (Consolidated)" : (payload.company?.name ?? activeSelection)}
        asOf={payload.asOf}
        currency={currency}
        exceptions={payload.exceptions}
        heat={payload.heat}
        onOpenChange={(open) => {
          if (!open) setDrawerRow(null);
        }}
      />
    </div>
  );
}
