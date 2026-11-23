"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "./StatusBadge";

import { EXCEPTION_STATUS_LABEL, EXCEPTION_STATUS_TONE } from "../constants";
import { phtDisplayStamp, phtToday } from "../pht";
import { runLabel } from "./ExceptionTable";
import { formatNumber, magnitudeText } from "../services/engine";
import type { ExceptionDetail } from "../types";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right tabular-nums" title={typeof value === "string" ? value : undefined}>{value}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/60">
      <h3 className="border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function ExceptionDetailDialog({
  detail,
  open,
  isSaving,
  onOpenChange,
  onMemo,
  onClose,
  onReading,
}: {
  detail: ExceptionDetail | null;
  open: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onMemo: (id: number, memo: string) => Promise<void>;
  onClose: (id: number, note: string) => Promise<void>;
  onReading: (id: number, period: string, value: number) => Promise<void>;
}) {
  const [memo, setMemo] = useState("");
  const [note, setNote] = useState("");
  const [period, setPeriod] = useState("");
  const [reading, setReading] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  if (!detail) return null;
  const row = detail.exception;
  // The next month to read is the one after the newest reading on this run.
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
      await onMemo(row.id, memo.trim());
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
          setNote("");
          setReading("");
          setProblem(null);
          setPeriod(nextPeriod);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[760px]">
        <DialogHeader className="space-y-2 border-b px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="line-clamp-1 text-base">{row.kpiName}</DialogTitle>
              <DialogDescription className="text-xs">
                {row.companyCode} · {row.kpiKey} · {runLabel(row)}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge tone={EXCEPTION_STATUS_TONE[row.status] ?? "neutral"}>{EXCEPTION_STATUS_LABEL[row.status] ?? row.status}</StatusBadge>
              {row.escalated_level > 0 ? (
                <StatusBadge tone="danger" title={`Escalated on ${row.escalated_at ?? "—"}`}>
                  Level {row.escalated_level}
                </StatusBadge>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Deviation", value: magnitudeText(row.deviation, row.unit, row.dp) },
              { label: "Memo due", value: row.memo_due_date ?? "—" },
              { label: "Readings", value: String(detail.readings.length) },
              { label: "Moved", value: row.direction === "UP" ? "Above target" : "Below target" },
            ].map((tile) => (
              <div key={tile.label} className="rounded-lg border border-border/60 bg-card px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{tile.label}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{tile.value}</div>
              </div>
            ))}
          </div>

          <Group title="Why it is on the board">
            <dl className="divide-y divide-border/50">
              <Row label="Reason" value={row.reason ?? "—"} />
              <Row label="Memo" value={row.memo_at ? `Filed ${phtDisplayStamp(row.memo_at)}` : "Not filed"} />
              <Row label="Closed" value={row.closed_at ? phtDisplayStamp(row.closed_at) : "—"} />
              <Row label="Close note" value={row.close_note ?? "—"} />
            </dl>
          </Group>

          <Group title="Readings recorded against this run">
            {detail.readings.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No reading has been recorded yet.</p>
            ) : (
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
                  {detail.readings.map((reading) => (
                    <TableRow key={reading.id}>
                      <TableCell className="pl-4 font-mono text-xs">{reading.period}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(reading.value, row.dp)}</TableCell>
                      <TableCell className="tabular-nums">{magnitudeText(reading.deviation, row.unit, row.dp)}</TableCell>
                      <TableCell className="pr-4">
                        <StatusBadge tone={reading.over_limit ? "danger" : "success"}>
                          {reading.over_limit ? "Over limit" : "In tolerance"}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                  className="h-9 w-[120px] tabular-nums"
                  aria-label="Reading value"
                />
              </label>
              <Button size="sm" variant="outline" className="h-9" onClick={submitReading} disabled={isSaving || reading.trim() === ""}>
                Add reading
              </Button>
            </div>
          </Group>

          <Group title="Memo to the review">
            <div className="space-y-2 px-4 py-3">
              <Textarea
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                rows={3}
                placeholder="What moved, why, and the fix with a date."
                className="min-h-[80px] resize-y"
                aria-label="Memo"
              />
              <div className="flex justify-end">
                <Button size="sm" className="h-9" onClick={submitMemo} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  File memo
                </Button>
              </div>
            </div>
          </Group>

          <Group title="Close this exception">
            <div className="space-y-2 px-4 py-3">
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What changed, in one line"
                className="h-9"
                aria-label="Close note"
              />
              <p className="text-xs text-muted-foreground">
                Closing needs two consecutive in-tolerance readings; the reading above is what counts.
              </p>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="h-9" onClick={submitClose} disabled={isSaving}>
                  Close exception
                </Button>
              </div>
            </div>
          </Group>

          {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
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
