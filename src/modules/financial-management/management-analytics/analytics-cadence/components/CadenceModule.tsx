"use client";

import { useMemo } from "react";
import { useState } from "react";
import { ClipboardCopy, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BoardHeader,
  MicroLabel,
  Panel,
  PanelHead,
  SectionHeading,
} from "@/modules/financial-management/management-analytics/shared/BoardKit";
import { StatusBadge } from "./StatusBadge";
import { useCadence } from "../hooks/useCadence";
import { ExecutivePackDialog } from "./ExecutivePackDialog";
import { Notice } from "./Notice";
import { phtToday } from "../pht";
import { STATUS_META, type Tone } from "../constants";
import type { CadenceRow, RhythmRow } from "../types";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The month the shared toolbar wrote into the address bar, or the PHT month it defaults to. */
function readUrlPeriod(): string {
  const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("period");
  return requested && MONTH.test(requested) ? requested : phtToday().slice(0, 7);
}

function healthTone(score: number): Tone {
  if (score >= 75) return "success";
  if (score >= 55) return "warning";
  return "danger";
}

function healthBadge(health: number | null) {
  if (health === null) return <span className="text-muted-foreground">not scored</span>;
  return <StatusBadge tone={healthTone(health)}>{health}</StatusBadge>;
}

const PACK_HEADER = ["Company", "Health", "On track", "Watch", "Provisional", "Breach", "Favorable", "Open", "Memo overdue"];

/** The reporting tier each rhythm answers to, as the reference names it. */
const TIER: Record<RhythmRow["rhythm"], string> = {
  DAILY: "Operational",
  WEEKLY: "Tactical",
  MONTHLY: "Executive",
};

/** Fallback for a browser that refuses the clipboard: the same tab-separated pack as a file. */
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

/**
 * Print the pack on its own page. The application shell (sidebar, header, dark surface) has no
 * place on a committee handout, and no print stylesheet exists to hide it, so the pack is written
 * into a throwaway document instead of printing the screen.
 */
function printPack(text: string, period: string) {
  const [head, ...body] = text.split("\n");
  const columns = head.split("\t");
  const rows = body.map((line) => line.split("\t"));
  const html = `<!doctype html><html><head><meta charSet="utf-8" /><title>Reporting pack ${escapeCell(period)}</title>
<style>
  body { font: 12px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 18mm; color: CanvasText; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  p { margin: 0 0 14px; color: GrayText; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-bottom: 1px solid GrayText; padding: 5px 6px; text-align: left; font-variant-numeric: tabular-nums; }
  th { background: Canvas; font-weight: 600; }
  td:not(:first-child), th:not(:first-child) { text-align: right; }
</style></head><body>
<h1>Reporting pack · ${escapeCell(period)}</h1>
<p>Health of every company in the group for the period, with the exceptions still open.</p>
<table><thead><tr>${columns.map((c) => `<th>${escapeCell(c)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escapeCell(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
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
  const cadence = useCadence(readUrlPeriod());
  const payload = cadence.data;
  const [packOpen, setPackOpen] = useState(false);

  const packRows = useMemo(() => payload?.rows ?? [], [payload]);

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

  /** The figures each rhythm has to carry, read off the same payload the pack uses. */
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
        { label: "Breaches forecast over 60%", value: formatNumber(payload.totals.forecastRisk) },
        { label: "Measures with no reading", value: formatNumber(Math.max(payload.totals.expected - payload.totals.readings, 0)) },
        { label: "Group health", value: payload.totals.health === null ? "not scored" : payload.totals.health.toFixed(1) },
      ],
      MONTHLY: [
        { label: "Measures read", value: `${formatNumber(payload.totals.readings)} of ${formatNumber(payload.totals.expected)}` },
        { label: "Companies in the pack", value: formatNumber(payload.rows.length) },
        { label: "On track", value: formatNumber(mix.onTrack) },
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
      // A browser can refuse the clipboard; the pack still has to leave the screen.
      downloadPack(text, `management-analytics-pack-${payload.period}.csv`);
      toast.success("Clipboard is blocked here, so the pack was downloaded.");
    }
  }

  return (
    <div className="space-y-4">
      <BoardHeader
        title="Reporting Cadence"
        subtitle="Three reporting rhythms for the group, with the status each one carries for the selected month."
        meta={
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
            {payload?.period ?? "latest month"}
          </span>
        }
        right={
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => {
              cadence.reload();
              // The read is silent, so say out loud which month it went and fetched.
              toast.success(`Rebuilt the pack for ${payload?.period ?? "the month"}.`);
            }}
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {cadence.error ? (
        <Notice tone="danger" title={payload ? "This pack is from the last read that worked" : "The pack could not be read"}>
          {cadence.error}
          {payload ? " Every figure below was read before that failure, so a recent change may be missing." : null}
        </Notice>
      ) : null}

      {/* An empty month is named, not swapped: the reader is told which month they asked for. */}
      {payload?.nearestPeriod ? (
        <Notice tone="info" title={`No readings exist for ${payload.period}`}>
          {`The nearest month with readings is ${payload.nearestPeriod}. Pick it in the toolbar to see a scored pack.`}
        </Notice>
      ) : null}

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

      {/* The reference's monthly heatmap. An empty cell reads as no reading, never as a clean month. */}
      {payload && payload.heatmap.keys.length > 0 ? (
        <>
          <SectionHeading
            title="Risk heatmap"
            description={`Company against core measure for ${payload.period}. A measure with no reading says so.`}
          />
          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left font-medium">Company</th>
                    {payload.heatmap.keys.map((column) => (
                      <th key={column.key} className="max-w-[150px] px-2 py-2 text-left font-medium">
                        <span className="line-clamp-2" title={column.name}>
                          {column.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {payload.heatmap.rows.map((row) => (
                    <tr key={row.code}>
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 font-medium">{row.name}</td>
                      {row.cells.map((code, index) => {
                        const meta = STATUS_META[code];
                        const column = payload.heatmap.keys[index];
                        return (
                          <td key={`${row.code}-${column?.key ?? index}`} className="px-1.5 py-1.5">
                            <span
                              className={cn("block h-4 w-full min-w-4 rounded-sm", meta.dot)}
                              title={`${row.name} · ${column?.name ?? ""}: ${meta.label}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
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

      <SectionHeading
        title="Monthly executive decision pack"
        description={`Company health for ${payload?.period ?? "the latest month"} · ${formatNumber(payload?.totals.readings ?? 0)} of ${formatNumber(payload?.totals.expected ?? 0)} ${(payload?.totals.expected ?? 0) === 1 ? "measure" : "measures"} read`}
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
              <Printer className="h-4 w-4" /> Open print view &amp; export
            </Button>
          </div>
        }
      />

      <Panel>
        <PanelHead
          title="Company health"
          description="Health score, the status mix behind it, and the exceptions still open."
          count={`${packRows.length} ${packRows.length === 1 ? "company" : "companies"}`}
        />
        <div className="hidden overflow-x-auto min-[1300px]:block">
          <table className="w-full min-w-[860px] text-sm">
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
                <th className="px-4 py-2 text-right font-medium">Memo overdue</th>
              </tr>
            </thead>
            <tbody>
              {!payload && cadence.isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`loading-${index}`} className="border-b border-border/40">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </td>
                    </tr>
                  ))
                : null}
              {packRows.map((row) => (
                <tr key={row.companyId} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{row.code}</div>
                    <div className="text-xs text-muted-foreground">{row.name}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{healthBadge(row.health)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(row.onTrack)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(row.watch)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(row.provisional)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.breach > 0 ? <StatusBadge tone="danger">{row.breach}</StatusBadge> : "0"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.favourable > 0 ? <StatusBadge tone="success">{row.favourable}</StatusBadge> : "0"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.exceptionsOpen}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.memoOverdue > 0 ? <StatusBadge tone="danger">{row.memoOverdue}</StatusBadge> : "0"}
                  </td>
                </tr>
              ))}
              {!cadence.isLoading && packRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No company has a reading for that month yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-border min-[1300px]:hidden">
          {!payload && cadence.isLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <li key={`loading-${index}`} className="px-4 py-3">
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                </li>
              ))
            : null}
          {packRows.map((row) => (
            <li key={row.companyId} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={row.code}>
                    {row.code}
                  </p>
                  <p className="truncate text-xs text-muted-foreground" title={row.name}>
                    {row.name}
                  </p>
                </div>
                {healthBadge(row.health)}
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">On track</dt>
                  <dd className="tabular-nums">{formatNumber(row.onTrack)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Watch</dt>
                  <dd className="tabular-nums">{formatNumber(row.watch)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Provisional</dt>
                  <dd className="tabular-nums">{formatNumber(row.provisional)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Breach</dt>
                  <dd className="tabular-nums">{formatNumber(row.breach)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Favorable</dt>
                  <dd className="tabular-nums">{formatNumber(row.favourable)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Open</dt>
                  <dd className="tabular-nums">{formatNumber(row.exceptionsOpen)}</dd>
                </div>
              </dl>
              {row.memoOverdue > 0 ? <p className="text-xs text-destructive">{row.memoOverdue} memo overdue</p> : null}
            </li>
          ))}
          {!cadence.isLoading && packRows.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">No company has a reading for that month yet.</li>
          ) : null}
        </ul>
      </Panel>

      <Panel>
        <PanelHead
          title="Feeds behind this pack"
          description="Every source that feeds a reading in this pack."
          count={`${payload?.sources.length ?? 0} ${(payload?.sources.length ?? 0) === 1 ? "feed" : "feeds"}`}
        />
        <div className="space-y-2 px-4 py-3 text-sm">
          {(payload?.sources ?? []).map((source) => (
            <div key={source.code} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-medium">{source.name}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {source.code} · {source.cadence} · {source.steward || "no steward"}
                </span>
              </div>
              <StatusBadge tone={source.fresh ? "success" : "warning"}>
                {source.fresh ? "Fresh" : source.lastSync ? "Stale" : "Never synced"}
              </StatusBadge>
            </div>
          ))}
        </div>
      </Panel>

      {payload ? (
        <p className="text-xs text-muted-foreground">
          Policy in force: seasonal targets {payload.policy.seasonalTargets ? "on" : "off"}, sustained rule{" "}
          {payload.policy.sustainedRule ? "on" : "off"}, {payload.policy.confirmPeriods} periods to confirm,{" "}
          {payload.policy.spikeMultiple}× spike override, {payload.policy.memoDeadlineDays} business days for a memo,{" "}
          {payload.policy.toleranceReadings} readings to close.
        </p>
      ) : null}
      <ExecutivePackDialog
        open={packOpen}
        payload={payload ?? null}
        summaryText={payload ? packText(payload.rows) : ""}
        onPrint={() => payload && printPack(packText(payload.rows), payload.period)}
        onOpenChange={setPackOpen}
      />
    </div>
  );
}
