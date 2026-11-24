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

import type { CadencePayload } from "../types";

export function ExecutivePackDialog({
  open,
  payload,
  summaryText,
  onPrint,
  onOpenChange,
}: {
  open: boolean;
  payload: CadencePayload | null;
  summaryText: string;
  onPrint: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  if (!payload) return null;

  const totalOnTrack = payload.rows.reduce((s, r) => s + r.onTrack + r.favourable, 0);
  const totalWatch = payload.rows.reduce((s, r) => s + r.watch + r.provisional, 0);
  const totalBreach = payload.rows.reduce((s, r) => s + r.breach, 0);
  const totalOverdue = payload.rows.reduce((s, r) => s + r.memoOverdue, 0);

  const downloadCsv = () => {
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = [
      "Period",
      "Company",
      "Code",
      "Health",
      "On Track",
      "Watch",
      "Provisional",
      "Confirmed Breach",
      "Favorable",
      "Open Exceptions",
      "Memos Overdue",
    ];
    const body = payload.rows.map((r) => [
      payload.period,
      r.name,
      r.code,
      r.health ?? "",
      r.onTrack,
      r.watch,
      r.provisional,
      r.breach,
      r.favourable,
      r.exceptionsOpen,
      r.memoOverdue,
    ]);
    const csv = [head.map(q).join(","), ...body.map((r) => r.map(q).join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `executive-pack-${payload.period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded CSV scorecard.");
  };

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text(`Executive Decision Pack — ${payload.period}`, 40, 38);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      `On track: ${totalOnTrack} · Watch/Provisional: ${totalWatch} · Confirmed breaches: ${totalBreach} · Memos overdue: ${totalOverdue}`,
      40,
      54,
    );
    autoTable(doc, {
      startY: 68,
      head: [["Company", "Health", "On track", "Watch", "Provisional", "Breach", "Favorable", "Open", "Overdue"]],
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
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [20, 38, 42] },
    });
    doc.save(`executive-pack-${payload.period}.pdf`);
    toast.success("Downloaded PDF executive pack.");
  };

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      toast.success("Executive pack copied as text.");
    } catch {
      toast.error("Clipboard is not available.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[900px]">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <DialogTitle>Executive Decision Pack · {payload.period}</DialogTitle>
              <DialogDescription>
                Preview and export the monthly group decision pack as PDF, CSV, or plain text.
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" size="sm" onClick={downloadPdf}>
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Download PDF
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={downloadCsv}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download CSV
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void copySummary()}>
                <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
                Copy text
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
              { label: "On track", value: totalOnTrack },
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

          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2 text-right">Health</th>
                  <th className="px-3 py-2 text-right">On track</th>
                  <th className="px-3 py-2 text-right">Watch</th>
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
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{row.onTrack}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {row.watch + row.provisional}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-destructive">
                      {row.breach}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{row.exceptionsOpen}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{row.memoOverdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
            Variance policy:{" "}
            {payload.policy.sustainedRule
              ? `sustained breach (${payload.policy.confirmPeriods} periods or ${payload.policy.spikeMultiple}× spike)`
              : "strict single-period mandate"}{" "}
            · memo due in {payload.policy.memoDeadlineDays} business days · closes after{" "}
            {payload.policy.toleranceReadings} in-tolerance periods.
          </p>
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
