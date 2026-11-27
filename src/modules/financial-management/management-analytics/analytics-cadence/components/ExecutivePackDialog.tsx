"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ClipboardCopy, Download, FileText, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COMPARE_OPTIONS,
  convertPhpValue,
  displayUnitForCurrency,
  type CompareMode,
  type CurrencyCode,
} from "./analytics-screens";
import { ErpTags } from "./BoardKit";
import type { CadencePayload, CadenceScorecardItem } from "../types";

function compareValue(item: CadenceScorecardItem, mode: CompareMode): number | null {
  if (mode === "mom") return item.priorActual;
  if (mode === "yoy") return item.yoyActual;
  return item.target;
}

function formatMetric(value: number | null, unit: string | null, dp: number, currency: CurrencyCode): string {
  const converted = convertPhpValue(value, unit, currency);
  if (converted === null) return "—";
  const shownUnit = displayUnitForCurrency(unit, currency);
  const num = converted.toLocaleString("en-PH", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  if (!shownUnit) return num;
  if (shownUnit === "%" || shownUnit === "pp") return `${num}${shownUnit}`;
  if (shownUnit === "₱M" || shownUnit === "$M" || shownUnit === "₱" || shownUnit === "$") {
    const sym = shownUnit.startsWith("$") ? "$" : "₱";
    const suffix = shownUnit.endsWith("M") ? "M" : "";
    return `${converted < 0 ? "−" : ""}${sym}${Math.abs(converted).toLocaleString("en-PH", { minimumFractionDigits: dp, maximumFractionDigits: dp })}${suffix}`;
  }
  return `${num} ${shownUnit}`;
}

export function ExecutivePackDialog({
  open,
  payload,
  compare = "target",
  currency = "PHP",
  summaryText,
  onPrint,
  onOpenChange,
}: {
  open: boolean;
  payload: CadencePayload | null;
  compare?: CompareMode;
  currency?: CurrencyCode;
  summaryText: string;
  onPrint: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  if (!payload) return null;

  const totalOnTrack = payload.rows.reduce((s, r) => s + r.onTrack + r.favourable, 0);
  const totalWatch = payload.rows.reduce((s, r) => s + r.watch + r.provisional, 0);
  const totalBreach = payload.rows.reduce((s, r) => s + r.breach, 0);
  const totalOverdue = payload.rows.reduce((s, r) => s + r.memoOverdue, 0);
  const scorecard = payload.scorecard ?? [];
  const openExceptions = payload.openExceptions ?? [];
  const compareLabel = COMPARE_OPTIONS.find((o) => o.value === compare)?.label ?? "vs Target";

  const downloadCsv = () => {
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const sections: string[] = [];

    sections.push("COMPANY HEALTH");
    sections.push(
      ["Period", "Company", "Code", "Health", "On Track", "Watch", "Provisional", "Confirmed Breach", "Favorable", "Open Exceptions", "Memos Overdue"]
        .map(q)
        .join(","),
    );
    for (const r of payload.rows) {
      sections.push(
        [payload.period, r.name, r.code, r.health ?? "", r.onTrack, r.watch, r.provisional, r.breach, r.favourable, r.exceptionsOpen, r.memoOverdue]
          .map(q)
          .join(","),
      );
    }

    sections.push("");
    sections.push(`KPI SCORECARD (${compareLabel} · ${currency})`);
    sections.push(["Company", "KPI Key", "Measure", "Actual", compareLabel, "Variance", "Status"].map(q).join(","));
    for (const item of scorecard) {
      const actualDisp = compare === "ytd" ? item.ytdActual : item.actual;
      sections.push(
        [
          item.companyCode,
          item.kpiKey,
          item.name,
          formatMetric(actualDisp, item.unit, item.dp, currency),
          formatMetric(compareValue(item, compare), item.unit, item.dp, currency),
          item.varianceText,
          item.statusLabel,
        ]
          .map(q)
          .join(","),
      );
    }

    sections.push("");
    sections.push("OPEN EXCEPTIONS & REMEDIATION");
    sections.push(["Company", "Measure", "Status", "Variance %", "Memo Due", "Root-Cause Memo"].map(q).join(","));
    for (const ex of openExceptions) {
      sections.push(
        [
          ex.companyCode,
          ex.kpiName,
          ex.status,
          `${ex.relativePct >= 0 ? "+" : ""}${ex.relativePct.toFixed(1)}%`,
          ex.memoDueDate ?? "—",
          ex.memo ?? "No memo filed",
        ]
          .map(q)
          .join(","),
      );
    }

    const blob = new Blob([sections.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `executive-pack-${payload.period}-${currency.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded 3-table executive pack CSV.");
  };

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text(`Executive Decision Pack — ${payload.period} (${currency} · ${compareLabel})`, 40, 38);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      `On track: ${totalOnTrack} · Watch/Provisional: ${totalWatch} · Confirmed breaches: ${totalBreach} · Memos overdue: ${totalOverdue}`,
      40,
      54,
    );

    autoTable(doc, {
      startY: 66,
      head: [["1. Company Health", "Health", "On track", "Watch", "Provisional", "Breach", "Favorable", "Open", "Overdue"]],
      body: payload.rows.map((r) => [
        `${r.code} · ${r.name}`,
        r.health !== null ? String(Math.round(r.health)) : "—",
        String(r.onTrack),
        String(r.watch),
        String(r.provisional),
        String(r.breach),
        String(r.favourable),
        String(r.exceptionsOpen),
        String(r.memoOverdue),
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [15, 92, 99] },
    });

    const yAfterHealth = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 220;
    autoTable(doc, {
      startY: yAfterHealth + 18,
      head: [["Company", "Measure", compare === "ytd" ? "YTD Avg" : "Actual", compareLabel, "Variance", "Status"]],
      body: scorecard.slice(0, 60).map((item) => [
        item.companyCode,
        item.name,
        formatMetric(compare === "ytd" ? item.ytdActual : item.actual, item.unit, item.dp, currency),
        formatMetric(compareValue(item, compare), item.unit, item.dp, currency),
        item.varianceText,
        item.statusLabel,
      ]),
      styles: { fontSize: 7.5, cellPadding: 3 },
      headStyles: { fillColor: [15, 92, 99] },
    });

    if (openExceptions.length > 0) {
      const yAfterScorecard = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 400;
      autoTable(doc, {
        startY: yAfterScorecard + 18,
        head: [["Company", "Exception Measure", "Status", "Variance", "Memo Due", "Remediation Memo"]],
        body: openExceptions.map((ex) => [
          ex.companyCode,
          ex.kpiName,
          ex.status,
          `${ex.relativePct >= 0 ? "+" : ""}${ex.relativePct.toFixed(1)}%`,
          ex.memoDueDate ?? "—",
          ex.memo ?? "—",
        ]),
        styles: { fontSize: 7.5, cellPadding: 3 },
        headStyles: { fillColor: [15, 92, 99] },
      });
    }

    doc.save(`executive-pack-${payload.period}-${currency.toLowerCase()}.pdf`);
    toast.success("Downloaded 3-table PDF executive pack.");
  };

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      toast.success("Executive pack copied to clipboard.");
    } catch {
      toast.error("Clipboard is not available.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[960px]">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <DialogTitle>Executive Decision Pack · {payload.period}</DialogTitle>
              <DialogDescription>
                {compareLabel} · Display currency: {currency}. Export as PDF, CSV, or clean print view.
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" size="sm" onClick={downloadPdf}>
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                PDF
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={downloadCsv}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                CSV
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void copySummary()}>
                <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
                Copy
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onPrint}>
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "On track / favorable", value: totalOnTrack },
              { label: "Watch / provisional", value: totalWatch },
              { label: "Confirmed breaches", value: totalBreach },
              { label: "Memos overdue", value: totalOverdue },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{item.value}</p>
              </div>
            ))}
          </div>

          {/* 1. Company Health */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              1 · Company Health
            </h3>
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2 text-right">Health</th>
                    <th className="px-3 py-2 text-right">On track</th>
                    <th className="px-3 py-2 text-right">Watch / Prov.</th>
                    <th className="px-3 py-2 text-right">Breach</th>
                    <th className="px-3 py-2 text-right">Open</th>
                    <th className="px-3 py-2 text-right">Overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {payload.rows.map((row) => (
                    <tr key={row.code}>
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {row.health !== null ? Math.round(row.health) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{row.onTrack + row.favourable}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{row.watch + row.provisional}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-destructive">{row.breach}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{row.exceptionsOpen}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{row.memoOverdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 2. KPI Scorecard */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              2 · KPI Scorecard ({scorecard.length} measures · {compareLabel} · {currency})
            </h3>
            <div className="max-h-[260px] overflow-auto rounded-lg border border-border/60">
              <table className="w-full min-w-[680px] text-xs">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Measure</th>
                    <th className="px-3 py-2 text-right">{compare === "ytd" ? "YTD Avg" : "Actual"}</th>
                    <th className="px-3 py-2 text-right">{compareLabel}</th>
                    <th className="px-3 py-2 text-right">Variance</th>
                    <th className="px-3 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {scorecard.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{item.companyCode}</td>
                      <td className="px-3 py-1.5 font-medium">
                        <span>{item.name}</span>{" "}
                        <ErpTags
                          kpiKey={item.kpiKey}
                          sourceCodes={item.sourceCodes}
                          basis={item.statusCode === "PROVISIONAL" ? "PROVISIONAL" : undefined}
                          compact
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                        {formatMetric(compare === "ytd" ? item.ytdActual : item.actual, item.unit, item.dp, currency)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {formatMetric(compareValue(item, compare), item.unit, item.dp, currency)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{item.varianceText}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{item.statusLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. Exceptions & Remediation */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              3 · Exceptions &amp; Remediation ({openExceptions.length} open)
            </h3>
            {openExceptions.length === 0 ? (
              <p className="rounded-lg border border-border/60 px-3 py-3 text-xs text-muted-foreground">
                No open exceptions on file.
              </p>
            ) : (
              <div className="max-h-[220px] overflow-auto rounded-lg border border-border/60">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                    <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">Company</th>
                      <th className="px-3 py-2">Measure</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Variance</th>
                      <th className="px-3 py-2">Memo Due</th>
                      <th className="px-3 py-2">Remediation Memo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {openExceptions.map((ex) => (
                      <tr key={ex.id}>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground">{ex.companyCode}</td>
                        <td className="px-3 py-1.5 font-medium">{ex.kpiName}</td>
                        <td className="px-3 py-1.5">{ex.status}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                          {ex.relativePct >= 0 ? "+" : ""}{ex.relativePct.toFixed(1)}%
                        </td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground">{ex.memoDueDate ?? "—"}</td>
                        <td className="max-w-[260px] truncate px-3 py-1.5 text-muted-foreground" title={ex.memo ?? undefined}>
                          {ex.memo ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-3">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
