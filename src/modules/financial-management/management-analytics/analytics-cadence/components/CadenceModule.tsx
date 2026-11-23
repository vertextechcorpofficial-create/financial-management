"use client";

import { useMemo } from "react";
import { ClipboardCopy, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "./StatusBadge";
import { useCadence } from "../hooks/useCadence";
import { Notice } from "./Notice";
import type { Tone } from "../constants";
import type { CadenceRow } from "../types";

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
  const cadence = useCadence();
  const payload = cadence.data;

  const packRows = useMemo(() => payload?.rows ?? [], [payload]);

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Reporting Cadence</h1>
          <p className="text-sm text-muted-foreground">
            The daily, weekly and monthly rhythm, and the pack the committee reads.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {payload && payload.periods.length > 0 ? (
            <Select value={payload.period} onValueChange={(value) => cadence.setPeriod(value)}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {[...payload.periods].reverse().map((period) => (
                  <SelectItem key={period} value={period}>
                    {period}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
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
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={copyPack}>
            <ClipboardCopy className="h-4 w-4" /> Copy the pack
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => payload && printPack(packText(payload.rows), payload.period)}>
            <Printer className="h-4 w-4" /> Print view
          </Button>
        </div>
      </div>

      {cadence.error ? (
        <Notice
          tone="danger"
          title={payload ? "This pack is from the last read that worked" : "The pack could not be read"}
        >
          {cadence.error}
          {payload ? " Every figure below was read before that failure, so a recent change may be missing." : null}
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(payload?.rhythms ?? []).map((rhythm) => (
          <Card key={rhythm.rhythm} className="border-border/60">
            <CardHeader className="space-y-1 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {rhythm.label}
                </CardTitle>
                <StatusBadge tone={rhythm.tone}>{rhythm.count}</StatusBadge>
              </div>
              <p className="text-sm font-medium">{rhythm.headline}</p>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">{rhythm.detail}</CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-t-[3px] border-t-primary/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3">
          <div>
            <CardTitle className="text-sm font-semibold">Executive decision pack</CardTitle>
            <p className="text-xs text-muted-foreground">
              Company health for {payload?.period ?? "the latest month"} · {payload?.totals.readings ?? 0} of{" "}
              {payload?.totals.expected ?? 0} {(payload?.totals.expected ?? 0) === 1 ? "measure" : "measures"} read
            </p>
          </div>
          <Badge variant="secondary">{packRows.length} {packRows.length === 1 ? "company" : "companies"}</Badge>
        </CardHeader>
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
                  <p className="truncate text-sm font-medium" title={row.code}>{row.code}</p>
                  <p className="truncate text-xs text-muted-foreground" title={row.name}>{row.name}</p>
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
              {row.memoOverdue > 0 ? (
                <p className="text-xs text-destructive">{row.memoOverdue} memo overdue</p>
              ) : null}
            </li>
          ))}
          {!cadence.isLoading && packRows.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              No company has a reading for that month yet.
            </li>
          ) : null}
        </ul>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="border-b border-border/60 px-4 py-3">
          <CardTitle className="text-sm font-semibold">Feeds behind this pack</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-4 py-3 text-sm">
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
        </CardContent>
      </Card>

      {payload ? (
        <p className="text-xs text-muted-foreground">
          Policy in force: seasonal targets {payload.policy.seasonalTargets ? "on" : "off"}, sustained rule{" "}
          {payload.policy.sustainedRule ? "on" : "off"}, {payload.policy.confirmPeriods} periods to confirm,{" "}
          {payload.policy.spikeMultiple}× spike override, {payload.policy.memoDeadlineDays} business days for a memo,{" "}
          {payload.policy.toleranceReadings} readings to close.
        </p>
      ) : null}
    </div>
  );
}
