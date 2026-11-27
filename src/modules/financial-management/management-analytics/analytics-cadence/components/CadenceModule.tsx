"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ClipboardCopy, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BoardHeader,
  Dot,
  ErpTags,
  MicroLabel,
  Panel,
  SectionHeading,
} from "./BoardKit";
import {
  COMPARE_OPTIONS,
  COMPARE_PARAM,
  convertPhpValue,
  CURRENCY_PARAM,
  displayUnitForCurrency,
  isPeriod,
  PERIOD_PARAM,
  type CompareMode,
  type CurrencyCode,
} from "./analytics-screens";
import { StatusBadge } from "./StatusBadge";
import { useCadence } from "../hooks/useCadence";
import { ExecutivePackDialog } from "./ExecutivePackDialog";
import { Notice } from "./Notice";
import { phtToday } from "../pht";
import { STATUS_META, type Tone } from "../constants";
import type { CadencePayload, CadenceRow, CadenceScorecardItem, RhythmRow } from "../types";

function healthTone(score: number): Tone {
  if (score >= 75) return "success";
  if (score >= 55) return "warning";
  return "danger";
}

function healthBadge(health: number | null) {
  if (health === null) return <span className="text-muted-foreground">—</span>;
  return <StatusBadge tone={healthTone(health)}>{health}</StatusBadge>;
}

const PACK_HEADER = ["Company", "Health", "On track", "Watch", "Provisional", "Breach", "Favorable", "Open", "Memo overdue"];

const TIER: Record<RhythmRow["rhythm"], string> = {
  DAILY: "Operational",
  WEEKLY: "Tactical",
  MONTHLY: "Executive",
};

function compareVal(item: CadenceScorecardItem, mode: CompareMode): number | null {
  if (mode === "mom") return item.priorActual;
  if (mode === "yoy") return item.yoyActual;
  return item.target;
}

function fmtMetric(val: number | null, unit: string | null, dp: number, currency: CurrencyCode): string {
  const c = convertPhpValue(val, unit, currency);
  if (c === null) return "—";
  const u = displayUnitForCurrency(unit, currency);
  const abs = Math.abs(c).toLocaleString("en-PH", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  if (!u) return `${c < 0 ? "−" : ""}${abs}`;
  if (u === "%" || u === "pp") return `${c < 0 ? "−" : ""}${abs}${u}`;
  if (u === "₱M" || u === "$M" || u === "₱" || u === "$") {
    return `${c < 0 ? "−" : ""}${u[0]}${abs}${u.endsWith("M") ? "M" : ""}`;
  }
  return `${c < 0 ? "−" : ""}${abs} ${u}`;
}

function downloadPack(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeCell(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function printHtmlPack(payload: CadencePayload, compare: CompareMode, currency: CurrencyCode) {
  const compareLabel = COMPARE_OPTIONS.find((o) => o.value === compare)?.label ?? "vs Target";
  const scorecard = payload.scorecard ?? [];
  const exceptions = payload.openExceptions ?? [];
  const html = `<!doctype html><html><head><meta charSet="utf-8" /><title>Executive Pack ${escapeCell(payload.period)}</title>
<style>
  body { font: 11px/1.45 ui-sans-serif, system-ui, sans-serif; margin: 14mm; color: #111827; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  h2 { font-size: 12px; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: 0.05em; color: #0f5c63; }
  p.sub { margin: 0 0 12px; color: #6b7280; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; font-variant-numeric: tabular-nums; }
  th { background: #f8fafc; font-weight: 600; font-size: 10px; text-transform: uppercase; color: #475569; }
  td.num, th.num { text-align: right; }
</style></head><body>
<h1>Executive Decision Pack · ${escapeCell(payload.period)}</h1>
<p class="sub">${escapeCell(compareLabel)} · Currency: ${escapeCell(currency)} · Group health ${payload.totals.health ?? "—"}</p>
<h2>1 · Company Health</h2>
<table><thead><tr><th>Company</th><th class="num">Health</th><th class="num">On track</th><th class="num">Watch / Prov</th><th class="num">Breach</th><th class="num">Favorable</th><th class="num">Open</th><th class="num">Overdue</th></tr></thead>
<tbody>${payload.rows
    .map(
      (r) =>
        `<tr><td>${escapeCell(r.code)} · ${escapeCell(r.name)}</td><td class="num">${r.health ?? "—"}</td><td class="num">${r.onTrack}</td><td class="num">${r.watch + r.provisional}</td><td class="num">${r.breach}</td><td class="num">${r.favourable}</td><td class="num">${r.exceptionsOpen}</td><td class="num">${r.memoOverdue}</td></tr>`,
    )
    .join("")}</tbody></table>
<h2>2 · KPI Scorecard (${scorecard.length} measures)</h2>
<table><thead><tr><th>Company</th><th>Measure</th><th class="num">${compare === "ytd" ? "YTD Avg" : "Actual"}</th><th class="num">${escapeCell(compareLabel)}</th><th class="num">Variance</th><th>Status</th></tr></thead>
<tbody>${scorecard
    .map(
      (item) =>
        `<tr><td>${escapeCell(item.companyCode)}</td><td>${escapeCell(item.name)}</td><td class="num">${escapeCell(
          fmtMetric(compare === "ytd" ? item.ytdActual : item.actual, item.unit, item.dp, currency),
        )}</td><td class="num">${escapeCell(fmtMetric(compareVal(item, compare), item.unit, item.dp, currency))}</td><td class="num">${escapeCell(item.varianceText)}</td><td>${escapeCell(item.statusLabel)}</td></tr>`,
    )
    .join("")}</tbody></table>
<h2>3 · Exceptions &amp; Remediation (${exceptions.length} open)</h2>
<table><thead><tr><th>Company</th><th>Measure</th><th>Status</th><th class="num">Variance</th><th>Memo Due</th><th>Remediation Memo</th></tr></thead>
<tbody>${
    exceptions.length === 0
      ? `<tr><td colspan="6">No open exceptions recorded.</td></tr>`
      : exceptions
          .map(
            (ex) =>
              `<tr><td>${escapeCell(ex.companyCode)}</td><td>${escapeCell(ex.kpiName)}</td><td>${escapeCell(ex.status)}</td><td class="num">${ex.relativePct >= 0 ? "+" : ""}${ex.relativePct.toFixed(1)}%</td><td>${escapeCell(ex.memoDueDate ?? "—")}</td><td>${escapeCell(ex.memo ?? "—")}</td></tr>`,
          )
          .join("")
  }</tbody></table>
</body></html>`;

  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  window.setTimeout(() => frame.remove(), 2000);
}

export function CadenceModule() {
  const searchParams = useSearchParams();
  const reqPeriod = searchParams.get(PERIOD_PARAM);
  const urlPeriod = isPeriod(reqPeriod) ? reqPeriod : phtToday().slice(0, 7);
  const rawCompare = searchParams.get(COMPARE_PARAM);
  const compare: CompareMode =
    rawCompare === "mom" || rawCompare === "yoy" || rawCompare === "ytd" ? rawCompare : "target";
  const currency: CurrencyCode = searchParams.get(CURRENCY_PARAM) === "USD" ? "USD" : "PHP";
  const compareLabel = COMPARE_OPTIONS.find((o) => o.value === compare)?.label ?? "vs Target";

  const cadence = useCadence(urlPeriod);
  const payload = cadence.data;
  const [packOpen, setPackOpen] = useState(false);
  const [packTab, setPackTab] = useState<"health" | "scorecard" | "exceptions">("health");
  const [refreshing, setRefreshing] = useState(false);

  const packRows = useMemo(() => payload?.rows ?? [], [payload]);
  const scorecard = useMemo(() => payload?.scorecard ?? [], [payload]);
  const openExceptions = useMemo(() => payload?.openExceptions ?? [], [payload]);

  const mix = useMemo(() => {
    const rows = payload?.rows ?? [];
    const sum = (pick: (row: CadenceRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
    return {
      onTrack: sum((row) => row.onTrack),
      watch: sum((row) => row.watch),
      provisional: sum((row) => row.provisional),
      breach: sum((row) => row.breach),
      favourable: sum((row) => row.favourable),
      noData: sum((row) => row.noData),
    };
  }, [payload]);

  const rhythmItems = useMemo(() => {
    if (!payload) return {} as Record<string, Array<{ label: string; value: string }>>;
    const judged = payload.rows.filter((row) => row.health !== null).length;
    return {
      DAILY: [
        { label: "Confirmed breaches", value: formatNumber(mix.breach) },
        { label: "Provisional breaches", value: formatNumber(mix.provisional) },
        { label: "Memos overdue", value: formatNumber(payload.totals.memoOverdue) },
        { label: "Stale data sources", value: formatNumber(payload.totals.staleSources) },
      ],
      WEEKLY: [
        { label: "Open exceptions", value: formatNumber(payload.totals.exceptionsOpen) },
        { label: "Companies judged", value: formatNumber(judged) },
        { label: "Breaches forecast >60%", value: formatNumber(payload.totals.forecastRisk) },
        { label: "Measures missing", value: formatNumber(Math.max(payload.totals.expected - payload.totals.readings, 0)) },
        { label: "Group health", value: payload.totals.health === null ? "—" : payload.totals.health.toFixed(1) },
      ],
      MONTHLY: [
        { label: "Measures read", value: `${formatNumber(payload.totals.readings)} of ${formatNumber(payload.totals.expected)}` },
        { label: "Companies in pack", value: formatNumber(payload.rows.length) },
        { label: "On track / favorable", value: formatNumber(mix.onTrack + mix.favourable) },
        { label: "Watch or provisional", value: formatNumber(mix.watch + mix.provisional) },
      ],
    } as Record<string, Array<{ label: string; value: string }>>;
  }, [payload, mix]);

  function packText(rows: CadenceRow[]): string {
    const lines = [PACK_HEADER.join("\t")];
    for (const row of rows) {
      lines.push(
        [row.code, row.health ?? "", row.onTrack, row.watch, row.provisional, row.breach, row.favourable, row.exceptionsOpen, row.memoOverdue].join("\t"),
      );
    }
    return lines.join("\n");
  }

  async function copyPack() {
    if (!payload) return;
    const text = packText(payload.rows);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("The pack is on the clipboard.");
    } catch {
      downloadPack(text, `management-analytics-pack-${payload.period}.csv`);
      toast.success("Clipboard blocked; downloaded pack CSV instead.");
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await cadence.reload();
      toast.success(`Rebuilt the pack for ${payload?.period ?? urlPeriod}.`);
    } finally {
      setRefreshing(false);
    }
  }

  const heatmapDetailByCode = useMemo(() => {
    const map = new Map<string, NonNullable<NonNullable<CadencePayload["heatmap"]["details"]>[number]>["cells"]>();
    for (const row of payload?.heatmap.details ?? []) map.set(row.code, row.cells);
    return map;
  }, [payload]);

  return (
    <div className="space-y-4">
      <BoardHeader
        title="Reporting Cadence"
        subtitle="Three reporting rhythms and the executive monthly decision pack (Company Health, KPI Scorecard, and Exceptions & Remediation)."
        meta={
          <>
            <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
              {payload?.period ?? urlPeriod}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {compareLabel} · {currency}
            </span>
          </>
        }
        right={
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            disabled={refreshing || cadence.isLoading}
            onClick={() => void handleRefresh()}
          >
            <RefreshCw className={cn("h-4 w-4", (refreshing || cadence.isLoading) && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {cadence.error ? (
        <Notice tone="danger" title={payload ? "Showing last successful pack" : "The pack could not be read"}>
          {cadence.error}
        </Notice>
      ) : null}

      {payload?.nearestPeriod ? (
        <Notice tone="info" title={`No readings exist for ${payload.period}`}>
          {`The nearest month with readings is ${payload.nearestPeriod}. Pick it in the toolbar to view a scored pack.`}
        </Notice>
      ) : null}

      {/* Three Rhythms */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(payload?.rhythms ?? []).map((rhythm) => (
          <Panel key={rhythm.rhythm} className="p-4">
            <MicroLabel>
              {rhythm.label} · {TIER[rhythm.rhythm]}
            </MicroLabel>
            <h2 className="mt-1.5 text-[17px] font-semibold leading-tight">{rhythm.headline}</h2>
            <ul className="mt-3 divide-y divide-border/50 text-sm">
              {(rhythmItems[rhythm.rhythm] ?? []).map((item) => (
                <li key={item.label} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-mono text-sm tabular-nums">{item.value}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-xs text-muted-foreground">{rhythm.detail}</p>
          </Panel>
        ))}
      </div>

      {/* Scannable Risk Heatmap */}
      {payload && payload.heatmap.keys.length > 0 ? (
        <>
          <SectionHeading
            title="Core KPI Risk Heatmap"
            description={`Company × Core measure for ${payload.period} showing actual status and variance.`}
          />
          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 z-10 bg-muted/90 px-3 py-2 text-left font-medium backdrop-blur">
                      Company
                    </th>
                    {payload.heatmap.keys.map((column) => (
                      <th key={column.key} className="max-w-[140px] px-2.5 py-2 text-left font-medium">
                        <span className="line-clamp-2" title={column.name}>
                          {column.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {payload.heatmap.rows.map((row) => {
                    const cellDetails = heatmapDetailByCode.get(row.code);
                    return (
                      <tr key={row.code} className="hover:bg-muted/20">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2 font-medium">
                          {row.name}
                        </td>
                        {row.cells.map((code, index) => {
                          const meta = STATUS_META[code];
                          const column = payload.heatmap.keys[index];
                          const detailCell = cellDetails?.[index];
                          return (
                            <td
                              key={`${row.code}-${column?.key ?? index}`}
                              className="px-2.5 py-2 font-mono tabular-nums"
                              title={`${row.name} · ${column?.name ?? ""}: ${meta.label}${detailCell?.actualText ? ` (${detailCell.actualText})` : ""}`}
                            >
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                <Dot tone={meta.tone === "accent" ? "primary" : meta.tone === "neutral" ? "muted" : meta.tone} />
                                <span className={cn(code === "NO_DATA" && "text-muted-foreground")}>
                                  {code === "NO_DATA"
                                    ? "—"
                                    : detailCell?.varianceText && detailCell.varianceText !== "—"
                                      ? detailCell.varianceText
                                      : meta.label}
                                </span>
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
            <div className="flex flex-wrap items-center gap-3 border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
              {Object.entries(STATUS_META).map(([code, meta]) => (
                <span key={code} className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2.5 w-2.5 rounded-sm", meta.dot)} />
                  {meta.label}
                </span>
              ))}
            </div>
          </Panel>
        </>
      ) : null}

      {/* Monthly Executive Decision Pack (All 3 Tables) */}
      <SectionHeading
        title="Monthly executive decision pack"
        description={`Three-part briefing for ${payload?.period ?? urlPeriod} · ${formatNumber(payload?.totals.readings ?? 0)} of ${formatNumber(payload?.totals.expected ?? 0)} measures read`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={copyPack} disabled={packRows.length === 0}>
              <ClipboardCopy className="h-4 w-4" /> Copy summary
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5"
              disabled={packRows.length === 0}
              onClick={() => setPackOpen(true)}
            >
              <Printer className="h-4 w-4" /> Preview &amp; Export Pack
            </Button>
          </div>
        }
      />

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">
              {packTab === "health"
                ? "1 · Company Health"
                : packTab === "scorecard"
                  ? `2 · KPI Scorecard (${compareLabel} · ${currency})`
                  : "3 · Exceptions & Remediation"}
            </p>
            <p className="text-xs text-muted-foreground">
              {packTab === "health"
                ? "Health score, status distribution, and open exceptions by company."
                : packTab === "scorecard"
                  ? "Every active measure evaluated for the selected period."
                  : "Open exceptions queued for controller/committee follow-up."}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
            {(
              [
                { id: "health", label: `Company Health (${packRows.length})` },
                { id: "scorecard", label: `KPI Scorecard (${scorecard.length})` },
                { id: "exceptions", label: `Exceptions (${openExceptions.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPackTab(t.id)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  packTab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {packTab === "health" ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[780px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Company</th>
                    <th className="px-4 py-2 text-right font-medium">Health</th>
                    <th className="px-4 py-2 text-right font-medium">On track</th>
                    <th className="px-4 py-2 text-right font-medium">Watch</th>
                    <th className="px-4 py-2 text-right font-medium">Provisional</th>
                    <th className="px-4 py-2 text-right font-medium">Breach</th>
                    <th className="px-4 py-2 text-right font-medium">Favorable</th>
                    <th className="px-4 py-2 text-right font-medium">Open</th>
                    <th className="px-4 py-2 text-right font-medium">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {packRows.map((row) => (
                    <tr key={row.companyId} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{row.code}</div>
                        <div className="text-xs text-muted-foreground">{row.name}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{healthBadge(row.health)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNumber(row.onTrack)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNumber(row.watch)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNumber(row.provisional)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {row.breach > 0 ? <StatusBadge tone="danger">{row.breach}</StatusBadge> : "0"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {row.favourable > 0 ? <StatusBadge tone="success">{row.favourable}</StatusBadge> : "0"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{row.exceptionsOpen}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {row.memoOverdue > 0 ? <StatusBadge tone="danger">{row.memoOverdue}</StatusBadge> : "0"}
                      </td>
                    </tr>
                  ))}
                  {!cadence.isLoading && packRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No company has a reading for {urlPeriod} yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {packRows.map((row) => (
                <li key={row.companyId} className="space-y-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.code}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.name}</p>
                    </div>
                    {healthBadge(row.health)}
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                    <div><dt className="font-sans text-muted-foreground">On track</dt><dd>{formatNumber(row.onTrack)}</dd></div>
                    <div><dt className="font-sans text-muted-foreground">Watch / Prov</dt><dd>{formatNumber(row.watch + row.provisional)}</dd></div>
                    <div><dt className="font-sans text-muted-foreground">Breach</dt><dd>{formatNumber(row.breach)}</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {packTab === "scorecard" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Measure</th>
                  <th className="px-4 py-2 text-right font-medium">{compare === "ytd" ? "YTD Avg" : "Actual"}</th>
                  <th className="px-4 py-2 text-right font-medium">{compareLabel}</th>
                  <th className="px-4 py-2 text-right font-medium">Variance</th>
                  <th className="px-4 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {scorecard.map((item) => {
                  const meta = STATUS_META[item.statusCode];
                  return (
                    <tr key={item.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{item.companyCode}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-xs">{item.name}</span>
                          <ErpTags
                            kpiKey={item.kpiKey}
                            sourceCodes={item.sourceCodes}
                            basis={item.statusCode === "PROVISIONAL" ? "PROVISIONAL" : undefined}
                            compact
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">
                        {fmtMetric(compare === "ytd" ? item.ytdActual : item.actual, item.unit, item.dp, currency)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {fmtMetric(compareVal(item, compare), item.unit, item.dp, currency)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">{item.varianceText}</td>
                      <td className="px-4 py-2 text-right">
                        <StatusBadge tone={meta.tone}>{item.statusLabel}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {packTab === "exceptions" ? (
          openExceptions.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">No open exceptions recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Company</th>
                    <th className="px-4 py-2 font-medium">Measure</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Variance</th>
                    <th className="px-4 py-2 font-medium">Memo Due</th>
                    <th className="px-4 py-2 font-medium">Remediation Memo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {openExceptions.map((ex) => (
                    <tr key={ex.id}>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{ex.companyCode}</td>
                      <td className="px-4 py-2 text-xs font-medium">{ex.kpiName}</td>
                      <td className="px-4 py-2">
                        <StatusBadge tone={ex.status === "ESCALATED" ? "danger" : "warning"}>{ex.status}</StatusBadge>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">
                        {ex.relativePct >= 0 ? "+" : ""}{ex.relativePct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{ex.memoDueDate ?? "—"}</td>
                      <td className="max-w-[260px] truncate px-4 py-2 text-xs text-muted-foreground" title={ex.memo ?? undefined}>
                        {ex.memo ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </Panel>

      {payload ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            Policy in force: seasonal targets {payload.policy.seasonalTargets ? "on" : "off"}, sustained rule{" "}
            {payload.policy.sustainedRule ? "on" : "off"}, {payload.policy.confirmPeriods} periods to confirm,{" "}
            {payload.policy.spikeMultiple}× spike override, {payload.policy.memoDeadlineDays} business days for a memo,{" "}
            {payload.policy.toleranceReadings} readings to close.
          </p>
          <Link href="/fm/management-analytics/analytics-data" className="font-medium text-primary hover:underline">
            Check feed freshness →
          </Link>
        </div>
      ) : null}

      <ExecutivePackDialog
        open={packOpen}
        payload={payload ?? null}
        compare={compare}
        currency={currency}
        summaryText={payload ? packText(payload.rows) : ""}
        onPrint={() => payload && printHtmlPack(payload, compare, currency)}
        onOpenChange={setPackOpen}
      />
    </div>
  );
}
