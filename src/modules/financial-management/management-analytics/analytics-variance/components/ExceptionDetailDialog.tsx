"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { ErpTags } from "./BoardKit";
import { ErpFormulaPanel } from "./ErpFormulaPanel";
import { StatusBadge } from "./StatusBadge";
import { displayDay } from "./dates";
import { runLabel } from "./ExceptionTable";
import { EXCEPTION_STATUS_LABEL, EXCEPTION_STATUS_TONE } from "../constants";
import { phtDisplayStamp, phtToday } from "../pht";
import { formatNumber, magnitudeText } from "../services/engine";
import type { ExceptionDetail, ExceptionReadingRow } from "../types";

function DeviationBars({ readings, unit, dp }: { readings: ExceptionReadingRow[]; unit: string | null; dp: number }) {
  const peak = Math.max(...readings.map((reading) => Math.abs(reading.deviation)), 0);
  return (
    <div className="space-y-1.5 border-b border-border/60 px-4 py-3">
      {readings.map((reading) => {
        const share = peak > 0 ? Math.abs(reading.deviation) / peak : 0;
        const positive = reading.deviation >= 0;
        const tone = reading.over_limit ? "bg-rose-600" : "bg-teal-700 dark:bg-teal-400";
        return (
          <div key={reading.id} className="flex items-center gap-2 text-xs">
            <span className="w-14 shrink-0 font-mono tabular-nums text-muted-foreground">{reading.period}</span>
            <span className="flex h-2 min-w-0 flex-1 items-center gap-px">
              <span className="flex h-full w-1/2 justify-end rounded-l-sm bg-muted">
                {positive ? null : <span className={`h-full rounded-l-sm ${tone}`} style={{ width: `${share * 100}%` }} />}
              </span>
              <span className="flex h-full w-1/2 rounded-r-sm bg-muted">
                {positive ? <span className={`h-full rounded-r-sm ${tone}`} style={{ width: `${share * 100}%` }} /> : null}
              </span>
            </span>
            <span className="w-20 shrink-0 text-right font-mono tabular-nums">{magnitudeText(reading.deviation, unit, dp)}</span>
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">
        Deviation under this run&apos;s rule; rose bars are over the limit.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-mono text-xs tabular-nums">{value}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/70">
      <h3 className="border-b border-border/60 bg-muted/25 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function ExceptionDetailDialog({
  detail,
  positionsByCompany,
  open,
  isSaving,
  onOpenChange,
  onMemo,
  onClose,
  onReopen,
  onReading,
}: {
  detail: ExceptionDetail | null;
  positionsByCompany?: Record<string, string[]>;
  open: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onMemo: (id: number, memo: string, ownerPosition?: string | null) => Promise<void>;
  onClose: (id: number, note: string) => Promise<void>;
  onReopen: (id: number, note?: string) => Promise<void>;
  onReading: (id: number, period: string, value: number) => Promise<void>;
}) {
  const [memo, setMemo] = useState("");
  const [ownerPosition, setOwnerPosition] = useState("");
  const [note, setNote] = useState("");
  const [period, setPeriod] = useState("");
  const [reading, setReading] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  if (!detail) return null;
  const row = detail.exception;
  const suggested = detail.kpi?.owner_position ?? row.suggestedOwner ?? "Company General Manager";
  const companyPositions = positionsByCompany?.[row.companyCode] ?? [
    suggested,
    "Company General Manager",
    "VP Operations",
    "Group CFO",
    "Group Executive Committee",
  ];
  const uniquePositions = Array.from(new Set([suggested, ...companyPositions].filter(Boolean)));
  const activeOwner = ownerPosition || row.ownerPosition || suggested;

  const latestRead = detail.readings.length
    ? detail.readings.map((item) => item.period).sort().at(-1) ?? row.period_start
    : row.period_start;
  const [latestYear, latestMonth] = latestRead.split("-").map(Number);
  const followingPeriod =
    latestMonth === 12
      ? `${latestYear + 1}-01`
      : `${latestYear}-${String(latestMonth + 1).padStart(2, "0")}`;
  const nextPeriod = phtToday().slice(0, 7);

  const submitMemo = async () => {
    setProblem(null);
    if (memo.trim().length < 20) {
      setProblem("A memo needs at least 20 characters: what happened and what fixes it.");
      return;
    }
    try {
      await onMemo(row.id, memo.trim(), activeOwner);
      setMemo("");
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "The memo could not be filed.");
    }
  };

  const submitClose = async () => {
    setProblem(null);
    try {
      await onClose(row.id, note.trim());
      setNote("");
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "The exception could not be closed.");
    }
  };

  const submitReopen = async () => {
    setProblem(null);
    try {
      await onReopen(row.id, note.trim() || undefined);
      setNote("");
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "The exception could not be reopened.");
    }
  };

  const readingPeriod = period || followingPeriod;

  const submitReading = async () => {
    setProblem(null);
    const value = Number(reading);
    if (!Number.isFinite(value)) {
      setProblem("Enter a number for the reading.");
      return;
    }
    try {
      await onReading(row.id, readingPeriod, value);
      setReading("");
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "The reading could not be recorded.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setMemo("");
          setOwnerPosition("");
          setNote("");
          setReading("");
          setProblem(null);
          setPeriod(nextPeriod);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={false} className="flex max-h-[88vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[780px]">
        <DialogHeader className="space-y-2 border-b px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="line-clamp-1 font-serif text-lg">{row.kpiName}</DialogTitle>
                <ErpTags kpiKey={row.kpiKey} sourceCodes={detail.kpi?.source_codes} />
              </div>
              <DialogDescription className="text-xs">
                {row.companyCode} · {row.kpiKey} · {runLabel(row)}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge tone={EXCEPTION_STATUS_TONE[row.status] ?? "neutral"}>
                {EXCEPTION_STATUS_LABEL[row.status] ?? row.status}
              </StatusBadge>
              {row.escalated_level > 0 ? (
                <StatusBadge
                  tone="danger"
                  title={`Escalated on ${row.escalated_at ? phtDisplayStamp(row.escalated_at) : "—"}`}
                >
                  {row.escalated_level >= 2 ? "→ Group Executive Committee" : `→ General Manager, ${row.companyCode}`}
                </StatusBadge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {(["Confirmed", "Owner + memo", "Monitoring", "Closed"] as const).map((stepLabel, idx) => {
              const stageIdx =
                row.status === "CLOSED"
                  ? 3
                  : row.status === "MONITORING" || row.status === "RECURRENCE"
                    ? 2
                    : row.memo_at
                      ? 1
                      : 0;
              const done = idx < stageIdx || (row.status === "CLOSED" && idx <= 3);
              const now = idx === stageIdx && row.status !== "CLOSED";
              return (
                <span
                  key={stepLabel}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-medium",
                    done
                      ? "bg-teal-700/15 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300"
                      : now
                        ? "bg-teal-800 text-white dark:bg-teal-400 dark:text-slate-950"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? "✓ " : ""}
                  {stepLabel}
                </span>
              );
            })}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Deviation", value: magnitudeText(row.deviation, row.unit, row.dp) },
              { label: "Memo due", value: row.memo_due_date ? displayDay(row.memo_due_date) : "—" },
              { label: "Readings", value: String(detail.readings.length) },
              { label: "Moved", value: row.direction === "UP" ? "Above target" : "Below target" },
            ].map((tile) => (
              <div key={tile.label} className="rounded-lg border border-border/70 bg-card px-4 py-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{tile.label}</div>
                <div className="mt-1 font-mono text-lg font-medium tabular-nums">{tile.value}</div>
              </div>
            ))}
          </div>

          <ErpFormulaPanel
            kpiKey={row.kpiKey}
            period={row.period_end}
            sourceCodes={detail.kpi?.source_codes}
          />

          <Group title="Why it is on the board">
            <dl className="divide-y divide-border/50">
              <Row label="Owner position" value={row.ownerPosition ?? suggested} />
              <Row label="Reason" value={row.reason ?? "—"} />
              <Row label="Memo" value={row.memo ? `${row.memo} (Filed ${row.memo_at ? phtDisplayStamp(row.memo_at) : "—"})` : "Not filed"} />
              <Row label="Closed" value={row.closed_at ? phtDisplayStamp(row.closed_at) : "—"} />
              <Row label="Close note" value={row.close_note ?? "—"} />
            </dl>
          </Group>

          <Group title="Post-fix verification readings">
            {detail.readings.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No reading has been recorded yet.</p>
            ) : (
              <>
                <DeviationBars readings={detail.readings} unit={row.unit} dp={row.dp} />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Period</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Deviation</TableHead>
                      <TableHead className="pr-4">Verdict</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.readings.map((readingRow) => (
                      <TableRow key={readingRow.id}>
                        <TableCell className="pl-4 font-mono text-xs">{readingRow.period}</TableCell>
                        <TableCell className="font-mono tabular-nums">{formatNumber(readingRow.value, row.dp)}</TableCell>
                        <TableCell className="font-mono tabular-nums">{magnitudeText(readingRow.deviation, row.unit, row.dp)}</TableCell>
                        <TableCell className="pr-4">
                          <StatusBadge tone={readingRow.over_limit ? "danger" : "success"}>
                            {readingRow.over_limit ? "Over limit" : "In tolerance"}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
            <div className="flex flex-wrap items-end gap-2 border-t border-border/60 px-4 py-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Period</span>
                <Input
                  value={period || followingPeriod}
                  onChange={(event) => setPeriod(event.target.value)}
                  placeholder="2026-12"
                  className="h-9 w-[110px] font-mono"
                  aria-label="Reading period"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Value</span>
                <Input
                  value={reading}
                  onChange={(event) => setReading(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-9 w-[120px] font-mono tabular-nums"
                  aria-label="Reading value"
                />
              </label>
              <Button size="sm" variant="outline" className="h-9" onClick={submitReading} disabled={isSaving || reading.trim() === ""}>
                Add reading
              </Button>
            </div>
          </Group>

          <Group title="Accountable owner & root-cause memo">
            <div className="space-y-3 px-4 py-3">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Accountable owner position</span>
                <Select value={activeOwner} onValueChange={setOwnerPosition}>
                  <SelectTrigger className="h-9" aria-label="Accountable owner position">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {uniquePositions.map((pos) => (
                      <SelectItem key={pos} value={pos}>
                        {pos === suggested ? `${pos} (suggested)` : pos}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Textarea
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                rows={3}
                placeholder="What moved, why, and the corrective action with a target completion date."
                className="min-h-[80px] resize-y"
                aria-label="Memo"
              />
              <div className="flex justify-end">
                <Button size="sm" className="h-9" onClick={submitMemo} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  File memo &amp; assign owner
                </Button>
              </div>
            </div>
          </Group>

          <Group title={row.status === "CLOSED" ? "Reopen exception" : "Close this exception"}>
            <div className="space-y-2 px-4 py-3">
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={row.status === "CLOSED" ? "Reason for reopening (optional)" : "What changed, in one line"}
                className="h-9"
                aria-label="Close or reopen note"
              />
              <p className="text-xs text-muted-foreground">
                {row.status === "CLOSED"
                  ? "Reopening returns this exception to Monitoring so new readings can be tracked."
                  : "Closing needs two consecutive in-tolerance readings above."}
              </p>
              <div className="flex justify-end gap-2">
                {row.status === "CLOSED" ? (
                  <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={submitReopen} disabled={isSaving}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reopen exception
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-9" onClick={submitClose} disabled={isSaving}>
                    Close exception
                  </Button>
                )}
              </div>
            </div>
          </Group>

          {problem ? <p className="text-sm text-rose-700 dark:text-rose-400">{problem}</p> : null}
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
