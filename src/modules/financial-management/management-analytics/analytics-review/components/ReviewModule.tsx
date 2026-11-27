"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CalendarCheck, Check, Copy, Download, Pause, Play, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BoardHeader, ErpTags, MicroLabel, Panel, Stat } from "./BoardKit";
import { TrendChart } from "./Charts";
import { ErpFormulaPanel } from "./ErpFormulaPanel";
import { PERIOD_PARAM } from "./analytics-screens";
import { displayDay } from "./dates";
import type { PeriodPoint } from "../types";

import { DateField } from "./DateField";
import { Notice } from "./Notice";
import { OptionCombobox } from "./OptionCombobox";
import { StatusBadge } from "./StatusBadge";
import { toneClass } from "../constants";
import { useReview } from "../hooks/useReview";
import { phtToday } from "../pht";
import type { ActionRow, ExceptionListRow, ReviewDetail, StaleSourceSummary } from "../types";

const KIND_LABEL: Record<string, string> = {
  ESCALATED: "Escalated",
  RECURRENCE: "Recurrence",
  OPEN: "Open",
  EARLY: "Early warning",
  MONITORING: "Monitoring",
  DATA: "Data quality",
  SIGN_OFF: "Awaiting sign-off",
};

function kindTone(kind: string): "danger" | "warning" | "info" | "neutral" {
  if (kind === "ESCALATED") return "danger";
  if (kind === "RECURRENCE" || kind === "DATA") return "warning";
  if (kind === "MONITORING" || kind === "EARLY") return "info";
  return "neutral";
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function readUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(name);
  return value && value.trim() ? value.trim() : null;
}

function readUrlPeriod(): string {
  return readUrlParam("period") ?? phtToday().slice(0, 7);
}

function readUrlCompany(): string {
  return readUrlParam("company") ?? "ALL";
}

function writeUrl(period: string, company: string) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (MONTH.test(period)) params.set("period", period);
  else params.delete("period");
  if (company && company !== "ALL") params.set("company", company);
  else params.delete("company");
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

function defaultActionDueDate(): string {
  const [y, m, d] = phtToday().split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 10));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function isUnfavorableException(exception: ExceptionListRow): boolean {
  const pol = (exception.polarity ?? "").toUpperCase();
  const dir = (exception.direction ?? "").toUpperCase();
  if (pol === "LOWER" || pol === "LOW") return dir === "UP" || dir === "UNFAVORABLE";
  if (pol === "HIGHER" || pol === "HIGH") return dir === "DOWN" || dir === "UNFAVORABLE";
  return true;
}

function formatTimer(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function ownerLabel(action: ActionRow): string {
  if (action.ownerPosition && action.ownerName) return `${action.ownerPosition} (${action.ownerName})`;
  if (action.ownerPosition) return action.ownerPosition;
  if (action.ownerName) return action.ownerName;
  return action.owner_user_id ? "Assigned" : "Unassigned";
}

type UnifiedAgendaItem = {
  key: string;
  id: number | null;
  sort: number;
  kind: string;
  ref_type: string | null;
  ref_id: number | null;
  title: string;
  minutes_alloc: number;
  notes: string | null;
  decision: string | null;
};

function toUnified(detail: ReviewDetail): UnifiedAgendaItem[] {
  if (detail.review) {
    return detail.items.map((item) => ({
      key: `item-${item.id}`,
      id: item.id,
      sort: item.sort,
      kind: item.kind,
      ref_type: item.ref_type,
      ref_id: item.ref_id,
      title: item.title,
      minutes_alloc: item.minutes_alloc,
      notes: item.notes,
      decision: item.decision,
    }));
  }
  return detail.planned.map((item, idx) => ({
    key: `plan-${item.kind}-${item.sort}-${idx}`,
    id: null,
    sort: item.sort,
    kind: item.kind,
    ref_type: item.ref_type,
    ref_id: item.ref_id,
    title: item.title,
    minutes_alloc: item.minutes_alloc,
    notes: item.notes,
    decision: item.decision,
  }));
}

type KpiPreview = {
  kpiId: number;
  actualText: string;
  targetText: string;
  dp: number;
  bandPct?: number;
  points: PeriodPoint[];
  breachProbability: number | null;
};

function ActiveItemWorkspace({
  period,
  item,
  exception,
  monitoringExceptions,
  staleSources,
  actions,
  meetingOpen,
  frozen,
  isSaving,
  onStartMeeting,
  onSaveItem,
  onMarkNext,
  onAddAction,
  onCloseAction,
  onDeleteAction,
}: {
  period: string;
  item: UnifiedAgendaItem;
  exception: ExceptionListRow | null;
  monitoringExceptions: ExceptionListRow[];
  staleSources: StaleSourceSummary[];
  actions: ActionRow[];
  meetingOpen: boolean;
  frozen: boolean;
  isSaving: boolean;
  onStartMeeting: () => Promise<void>;
  onSaveItem: (id: number, patch: { notes?: string; decision?: string }) => Promise<void>;
  onMarkNext: (id: number, patch: { notes?: string; decision?: string }) => Promise<void>;
  onAddAction: (payload: { title: string; dueDate?: string; exceptionId?: number; ownerPosition?: string }) => Promise<void>;
  onCloseAction: (id: number) => Promise<void>;
  onDeleteAction: (id: number) => Promise<void>;
}) {
  const [notes, setNotes] = useState(item.notes ?? "");
  const [decision, setDecision] = useState(item.decision ?? "");
  const [actionTitle, setActionTitle] = useState("");
  const [actionOwnerPos, setActionOwnerPos] = useState(exception?.ownerPosition ?? "");
  const [actionDue, setActionDue] = useState(defaultActionDueDate);
  const [kpiPreview, setKpiPreview] = useState<KpiPreview | null>(null);
  const today = phtToday();

  useEffect(() => {
    if (!exception?.kpi_id) return;
    let cancelled = false;
    fetch(`/api/fm/management-analytics/tiers/${exception.kpi_id}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: {
        data?: {
          row?: { actualText?: string; targetText?: string; kpi?: { dp?: number; rule_type?: string; threshold?: number | null } };
          points?: PeriodPoint[];
          forecast?: { breachProbability?: number | null } | null;
        };
      } | null) => {
        if (cancelled || !body?.data) return;
        const k = body.data.row?.kpi;
        setKpiPreview({
          kpiId: exception.kpi_id,
          actualText: body.data.row?.actualText ?? "—",
          targetText: body.data.row?.targetText ?? "—",
          dp: k?.dp ?? exception.dp ?? 1,
          bandPct: k?.rule_type === "PCT" && k.threshold ? k.threshold / 100 : undefined,
          points: (body.data.points ?? []).slice(-12),
          breachProbability: body.data.forecast?.breachProbability ?? null,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [exception?.kpi_id, exception?.dp]);

  const activePreview = exception && kpiPreview?.kpiId === exception.kpi_id ? kpiPreview : null;

  const itemActions = useMemo(() => {
    if (exception) return actions.filter((a) => a.exception_id === exception.id);
    return actions;
  }, [actions, exception]);

  const varText = exception
    ? `${exception.relative_pct >= 0 ? "+" : ""}${exception.relative_pct.toFixed(1)}%`
    : null;
  const overdueDays =
    exception && exception.memo_due_date && !exception.memo_at && exception.memo_due_date < today;

  return (
    <Panel className="p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {exception ? (
              <>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {exception.companyCode} · {exception.companyName}
                </Badge>
                <ErpTags kpiKey={exception.kpiKey} sourceCodes={exception.sourceCodes} />
              </>
            ) : null}
            <span className="font-mono text-xs text-muted-foreground">{item.minutes_alloc} min allocated</span>
          </div>
          <h2 className="text-lg font-semibold leading-snug tracking-tight">{item.title}</h2>
        </div>
        <StatusBadge tone={kindTone(item.kind)}>
          {KIND_LABEL[item.kind] ?? item.kind}
          {exception && exception.escalated_level > 0
            ? exception.escalated_level >= 2
              ? " → Group Exec Committee"
              : ` → GM, ${exception.companyCode}`
            : ""}
        </StatusBadge>
      </div>

      {/* Linked exception 4-tile context + 12-month TrendChart + rule/memo summary */}
      {exception ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <Stat
                label="Actual"
                value={activePreview?.actualText ?? "—"}
              />
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <Stat
                label="Target"
                value={activePreview?.targetText ?? "—"}
              />
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <Stat
                label="Variance"
                value={varText ?? "—"}
                tone={isUnfavorableException(exception) ? "danger" : "info"}
              />
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <Stat
                label="P(breach next)"
                value={
                  activePreview?.breachProbability != null
                    ? `${Math.round(activePreview.breachProbability * 100)}%`
                    : exception.status
                }
                tone={
                  activePreview?.breachProbability != null
                    ? activePreview.breachProbability > 0.6
                      ? "danger"
                      : activePreview.breachProbability > 0.3
                        ? "warning"
                        : "success"
                    : overdueDays
                      ? "danger"
                      : undefined
                }
              />
            </div>
          </div>

          {activePreview && activePreview.points.length > 0 ? (
            <div className="rounded-lg border border-border/60 bg-card/50 p-3">
              <TrendChart
                points={activePreview.points}
                dp={activePreview.dp}
                tone={isUnfavorableException(exception) ? "danger" : "primary"}
                bandPct={activePreview.bandPct}
              />
            </div>
          ) : null}

          <ErpFormulaPanel kpiKey={exception.kpiKey} period={period} sourceCodes={exception.sourceCodes} />

          <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/15 p-3 sm:grid-cols-2">
            <div>
              <MicroLabel>Rule &amp; deadline</MicroLabel>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {exception.reason ?? `Triggered during ${exception.period_start}–${exception.period_end}.`}{" "}
                {exception.memo_due_date ? `Memo due ${displayDay(exception.memo_due_date)}.` : ""}
                {overdueDays ? <span className="font-medium text-destructive"> Overdue.</span> : null}
              </p>
            </div>
            <div>
              <MicroLabel>Owner &amp; root-cause memo</MicroLabel>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {exception.memo ? (
                  exception.memo
                ) : (
                  <span className="font-medium text-destructive">No root-cause memo filed yet.</span>
                )}
              </p>
            </div>
          </div>
        </div>
      ) : (item.kind === "MONITORING" || item.kind === "EARLY") && monitoringExceptions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {item.kind === "EARLY"
              ? "Early warnings: monitoring deviations or watch items that need confirmation before breaching."
              : "Owner and memo filed; waiting for consecutive in-tolerance readings to close."}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>KPI</TableHead>
                  <TableHead>Variance</TableHead>
                  <TableHead>Period</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monitoringExceptions.map((ex) => (
                  <TableRow key={ex.id}>
                    <TableCell className="text-xs text-muted-foreground">{ex.companyName}</TableCell>
                    <TableCell className="text-xs font-medium">{ex.kpiName}</TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {ex.relative_pct >= 0 ? "+" : ""}
                      {ex.relative_pct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{ex.period_end}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : item.kind === "DATA" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Feeds past their freshness window during {period}. Confirm whether numbers on this agenda remain provisional.
            </p>
            <Link
              href={`/fm/management-analytics/analytics-data?period=${encodeURIComponent(period)}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open Data &amp; Feeds →
            </Link>
          </div>
          {staleSources.length === 0 ? (
            <p className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
              All monitored feeds are currently within their freshness limits.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Last sync</TableHead>
                    <TableHead className="text-right">SLA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staleSources.map((src) => (
                    <TableRow key={src.code}>
                      <TableCell className="text-xs font-medium">
                        <span className="font-mono">{src.code}</span> · {src.name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{src.state}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {src.last_sync_at ? displayDay(src.last_sync_at.slice(0, 10)) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {src.sla_minutes} min
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : item.kind === "SIGN_OFF" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-3.5 py-3 text-xs">
          <span className="text-muted-foreground">
            Pending governance or threshold changes queued for executive sign-off before the close lock.
          </span>
          <Link
            href="/fm/management-analytics/analytics-governance"
            className="font-medium text-primary hover:underline"
          >
            Open Governance &amp; Sign-offs →
          </Link>
        </div>
      ) : null}

      {!meetingOpen ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3.5 py-3 text-xs">
          <span className="text-muted-foreground">
            Previewing the generated agenda. Start the meeting to freeze the agenda and record decisions and actions.
          </span>
          <Button size="sm" className="gap-1.5" onClick={() => void onStartMeeting()} disabled={isSaving}>
            <Play className="h-3.5 w-3.5" />
            Start meeting
          </Button>
        </div>
      ) : (
        <>
          {/* Decision & Notes */}
          <div className="space-y-3 pt-1">
            <div>
              <MicroLabel className="mb-1.5 block">Decision</MicroLabel>
              <Textarea
                value={decision}
                onChange={(event) => setDecision(event.target.value)}
                rows={2}
                placeholder="What did the meeting decide?"
                aria-label={`Decision for ${item.title}`}
                readOnly={isSaving || frozen}
                className="min-h-[64px] resize-y text-sm read-only:cursor-not-allowed read-only:opacity-60"
              />
            </div>
            <div>
              <MicroLabel className="mb-1.5 block">Discussion notes</MicroLabel>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="What was said, key context, or risks raised"
                aria-label={`Notes for ${item.title}`}
                readOnly={isSaving || frozen}
                className="min-h-[56px] resize-y text-sm read-only:cursor-not-allowed read-only:opacity-60"
              />
            </div>
          </div>

          {/* Inline Action Items */}
          <div className="space-y-2 border-t border-border/60 pt-3">
            <MicroLabel>Action items {exception ? "for this exception" : "in this meeting"}</MicroLabel>
            {itemActions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No actions yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Action</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Due</TableHead>
                      {!frozen ? <TableHead className="w-9" /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemActions.map((act) => {
                      const done = act.status === "DONE";
                      const late = !done && Boolean(act.due_date && act.due_date < today);
                      return (
                        <TableRow key={act.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={done}
                              disabled={done || isSaving}
                              onChange={() => {
                                if (!done) void onCloseAction(act.id);
                              }}
                              aria-label={`Mark ${act.title} done`}
                              className="h-4 w-4 accent-primary"
                            />
                          </TableCell>
                          <TableCell className={cn("text-xs", done && "text-muted-foreground line-through")}>
                            {act.title}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{ownerLabel(act)}</TableCell>
                          <TableCell className={cn("font-mono text-xs tabular-nums", late && "font-medium text-destructive")}>
                            {act.due_date ? displayDay(act.due_date) : "—"}
                          </TableCell>
                          {!frozen ? (
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                disabled={isSaving}
                                aria-label={`Delete action ${act.title}`}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={async () => {
                                  await onDeleteAction(act.id);
                                  toast.success("Action item removed");
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {!frozen ? (
              <div className="grid gap-2 pt-1 sm:grid-cols-[minmax(0,1fr)_165px_145px_auto]">
                <Input
                  value={actionTitle}
                  onChange={(event) => setActionTitle(event.target.value)}
                  placeholder="New action, e.g. Re-baseline schedule with site lead"
                  aria-label="New action"
                  className="h-9 text-sm"
                />
                <Input
                  value={actionOwnerPos}
                  onChange={(event) => setActionOwnerPos(event.target.value)}
                  placeholder="Owner position"
                  aria-label="Owner position"
                  className="h-9 text-sm"
                />
                <DateField
                  value={actionDue}
                  onChange={setActionDue}
                  placeholder="Due date"
                  aria-label="Action due date"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 gap-1"
                  disabled={isSaving || actionTitle.trim().length < 3}
                  onClick={async () => {
                    await onAddAction({
                      title: actionTitle.trim(),
                      dueDate: actionDue || undefined,
                      exceptionId: exception?.id,
                      ownerPosition: actionOwnerPos.trim() || undefined,
                    });
                    setActionTitle("");
                    setActionDue(defaultActionDueDate());
                    toast.success("Action item added");
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            ) : null}
          </div>

          {/* Footer Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            {exception ? (
              <Link
                href={`/fm/management-analytics/analytics-variance?company=${encodeURIComponent(exception.companyCode)}`}
                className="text-xs font-medium text-primary hover:underline"
              >
                Open in Variance Protocol →
              </Link>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {!frozen && item.id !== null ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSaving}
                    onClick={async () => {
                      await onSaveItem(item.id!, { notes, decision });
                      toast.success("Agenda item saved");
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={isSaving}
                    onClick={async () => {
                      const finalDecision = decision.trim() || "Discussed — noted in minutes";
                      setDecision(finalDecision);
                      await onMarkNext(item.id!, { notes, decision: finalDecision });
                    }}
                  >
                    {item.decision?.trim() ? "Next item" : "Mark discussed & next"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

export function ReviewModule() {
  const searchParams = useSearchParams();
  const urlPeriod = searchParams.get(PERIOD_PARAM);
  const period = urlPeriod && MONTH.test(urlPeriod) ? urlPeriod : readUrlPeriod();
  const [company, setCompanyState] = useState(readUrlCompany);
  const setCompany = (next: string) => {
    setCompanyState(next);
    writeUrl(period, next);
  };

  const review = useReview(period, company);
  const detail = review.detail;

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<string | null>(null);
  const [minutesDraft, setMinutesDraft] = useState<string | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Clean React effect for meeting timer
  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const agenda = useMemo(() => (detail ? toUnified(detail) : []), [detail]);
  const activeKey = useMemo(() => {
    if (selectedKey && agenda.some((a) => a.key === selectedKey)) return selectedKey;
    const firstOpen = agenda.find((a) => !a.decision?.trim());
    return (firstOpen ?? agenda[0])?.key ?? null;
  }, [agenda, selectedKey]);

  const activeItem = agenda.find((a) => a.key === activeKey) ?? null;
  const exceptionById = useMemo(() => {
    const map = new Map<number, ExceptionListRow>();
    for (const ex of detail?.exceptions ?? []) map.set(ex.id, ex);
    return map;
  }, [detail]);

  const monitoringExceptions = useMemo(
    () => (detail?.exceptions ?? []).filter((ex) => ex.status === "MONITORING"),
    [detail],
  );

  const totalMinutes = agenda.reduce((sum, item) => sum + item.minutes_alloc, 0);
  const discussedCount = agenda.filter((item) => Boolean(item.decision?.trim())).length;
  const frozen = detail?.review?.status === "FINAL";
  const meetingOpen = Boolean(detail?.review);

  const attendanceValue = attendanceDraft ?? detail?.review?.attendees ?? "";
  const minutesValue = minutesDraft ?? detail?.review?.minutes ?? "";

  const companyLabel =
    company === "ALL"
      ? "Group"
      : detail?.company?.name ?? detail?.companies.find((c) => c.code === company)?.name ?? company;

  const statusLabel = frozen
    ? "Ended"
    : timerRunning
      ? "In progress"
      : elapsedSec > 0
        ? "Paused"
        : meetingOpen
          ? "Draft"
          : "Not started";

  const today = phtToday();
  const openActions = (detail?.actions ?? []).filter((a) => a.status !== "DONE");
  const overdueActions = openActions.filter((a) => Boolean(a.due_date && a.due_date < today));

  const buildMarkdownMinutes = () => {
    const lines = [
      `# Monthly Review — ${companyLabel}, ${detail?.period ?? period}`,
      "",
      `- Status: ${statusLabel}`,
      `- Attendees: ${attendanceValue || "—"}`,
      `- Duration: ${Math.round(elapsedSec / 60)} min (planned ${totalMinutes} min)`,
      `- Items discussed: ${discussedCount} of ${agenda.length}`,
      "",
      "## Agenda",
      "",
      ...agenda.flatMap((item, idx) => [
        `### ${idx + 1}. ${item.title} — ${KIND_LABEL[item.kind] ?? item.kind} (${item.minutes_alloc} min)`,
        item.notes ? `Notes: ${item.notes}` : "",
        `**Decision:** ${item.decision || "—"}`,
        "",
      ]),
      ...(minutesValue.trim() ? ["## General Minutes", "", minutesValue.trim(), ""] : []),
      "## Action Items",
      "",
      ...((detail?.actions ?? []).length > 0
        ? (detail?.actions ?? []).map(
            (a) => `- [${a.status === "DONE" ? "x" : " "}] ${a.title} — ${ownerLabel(a)} — due ${a.due_date ?? "—"}`,
          )
        : ["- None recorded."]),
    ];
    return lines.filter((l) => l !== undefined).join("\n");
  };

  const copyMinutes = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdownMinutes());
      toast.success("Minutes copied to clipboard");
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const downloadMinutes = () => {
    const md = buildMarkdownMinutes();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `review-minutes-${company.toLowerCase()}-${detail?.period ?? period}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStartMeeting = async () => {
    if (!meetingOpen) {
      await review.open();
    }
    setTimerRunning(true);
    toast.success("Meeting started");
  };

  const handleEndMeeting = async () => {
    setTimerRunning(false);
    await review.saveMeeting({
      attendees: attendanceValue,
      minutes: minutesValue,
      status: "FINAL",
    });
    toast.success("Meeting ended. Minutes are ready to copy or download.");
  };

  const handleMarkNext = async (id: number, patch: { notes?: string; decision?: string }) => {
    await review.saveItem(id, patch);
    const idx = agenda.findIndex((a) => a.id === id);
    const next =
      agenda.slice(idx + 1).find((a) => !a.decision?.trim() && a.id !== id) ??
      agenda.find((a) => !a.decision?.trim() && a.id !== id);
    if (next) {
      setSelectedKey(next.key);
    } else {
      toast.success("All agenda items discussed");
    }
  };

  return (
    <div className="space-y-4">
      <BoardHeader
        title={`Monthly Review — ${companyLabel}, ${period}`}
        subtitle="Meeting mode. The agenda is built from open exceptions (most severe first), provisional breaches, forecast risks and standing items. Record decisions and action items with an owner and due date as you go; minutes are generated at the end."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <OptionCombobox
              value={company}
              onChange={setCompany}
              placeholder="Every company"
              searchPlaceholder="Search companies"
              emptyLabel="No company matches."
              className="h-9 w-full justify-between font-normal sm:w-[210px]"
              options={[
                { value: "ALL", label: "Every company" },
                ...(detail?.companies ?? []).map((row) => ({ value: row.code, label: `${row.code} · ${row.name}` })),
              ]}
            />
          </div>
        }
      />

      {!review.validPeriod ? (
        <Notice tone="warning" title="That month is not a date">
          Use a month like 2026-11. Nothing is read until the month is complete.
        </Notice>
      ) : null}

      {review.error ? <Card className={`px-4 py-3 text-sm ${toneClass("danger")}`}>{review.error}</Card> : null}

      {review.validPeriod && review.isLoading && !detail ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">Reading the month…</Card>
      ) : null}

      {review.validPeriod && detail ? (
        <>
          {/* #mtgBar — Meeting mode control bar (always visible) */}
          <Panel className="flex flex-wrap items-center gap-4 p-4">
            <div>
              <MicroLabel>Status</MicroLabel>
              <p className="mt-0.5 text-sm font-semibold">{statusLabel}</p>
            </div>

            <div>
              <MicroLabel>Time</MicroLabel>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                {formatTimer(elapsedSec)}{" "}
                <span className="font-sans text-xs font-normal text-muted-foreground">/ {totalMinutes} min planned</span>
              </p>
            </div>

            <div className="min-w-[150px] flex-1">
              <div className="flex items-center justify-between">
                <MicroLabel>Agenda progress</MicroLabel>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {discussedCount}/{agenda.length}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${agenda.length > 0 ? (discussedCount / agenda.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <Input
              value={attendanceValue}
              onChange={(event) => setAttendanceDraft(event.target.value)}
              onBlur={() => {
                if (meetingOpen && !frozen && attendanceDraft !== null) {
                  void review.saveMeeting({ attendees: attendanceDraft, minutes: minutesValue });
                }
              }}
              placeholder="Attendees (e.g. GM, Finance Mgr, QA Mgr)"
              aria-label="Attendees"
              readOnly={frozen}
              className="h-9 w-full sm:w-[240px] read-only:cursor-not-allowed read-only:opacity-60"
            />

            <div className="flex flex-wrap items-center gap-1.5">
              {frozen ? (
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="success">
                    Final {detail.review?.held_at ? `· ${displayDay(detail.review.held_at)}` : ""}
                  </StatusBadge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={review.isSaving}
                    onClick={async () => {
                      await review.saveMeeting({ status: "DRAFT" });
                      toast.success("Meeting reopened for edits");
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reopen
                  </Button>
                </div>
              ) : timerRunning ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setTimerRunning(false)}
                  >
                    <Pause className="h-3.5 w-3.5" />
                    Pause
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={review.isSaving}
                    onClick={async () => {
                      await review.saveMeeting({ refreshAgenda: true });
                      toast.success("Agenda refreshed with new open exceptions");
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh agenda
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={review.isSaving}
                    onClick={() => void handleEndMeeting()}
                  >
                    <CalendarCheck className="h-3.5 w-3.5" />
                    End meeting
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={review.isSaving || agenda.length === 0}
                    onClick={() => void handleStartMeeting()}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {elapsedSec > 0 ? "Resume" : "Start meeting"}
                  </Button>
                  {meetingOpen ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={review.isSaving}
                        onClick={async () => {
                          await review.saveMeeting({ refreshAgenda: true });
                          toast.success("Agenda refreshed with new open exceptions");
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Refresh agenda
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={review.isSaving}
                        onClick={() => void handleEndMeeting()}
                      >
                        <CalendarCheck className="h-3.5 w-3.5" />
                        End meeting
                      </Button>
                    </>
                  ) : null}
                </>
              )}
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => void copyMinutes()}>
                <Copy className="h-3.5 w-3.5" />
                Copy minutes
              </Button>
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={downloadMinutes}>
                <Download className="h-3.5 w-3.5" />
                .md
              </Button>
            </div>
          </Panel>

          {/* #mtgGrid — 2-column Split Pane (340px Agenda list | Active item workspace) */}
          {agenda.length === 0 ? (
            <Card className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing on the agenda for {detail.period}: no open exception and no stale source.
            </Card>
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
              {/* Left column: #agenda */}
              <Panel className="overflow-hidden">
                <div className="border-b border-border/60 px-3.5 py-3">
                  <p className="text-sm font-semibold">
                    Agenda{" "}
                    <span className="font-normal text-xs text-muted-foreground">
                      · {agenda.length} {agenda.length === 1 ? "item" : "items"} · {totalMinutes} min
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Built from exceptions, provisional breaches, forecast risks and standing items.
                  </p>
                </div>
                <ul className="divide-y divide-border/50">
                  {agenda.map((item, idx) => {
                    const selected = item.key === activeKey;
                    const decided = Boolean(item.decision?.trim());
                    const linkedExc = item.ref_id ? exceptionById.get(item.ref_id) ?? null : null;
                    const linkedOpenActs = linkedExc
                      ? openActions.filter((a) => a.exception_id === linkedExc.id).length
                      : 0;
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(item.key)}
                          className={cn(
                            "flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors",
                            selected
                              ? "border-l-2 border-l-primary bg-primary/10"
                              : "border-l-2 border-l-transparent hover:bg-muted/40",
                          )}
                        >
                          <span className="mt-0.5 w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                            {decided ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium leading-snug">{item.title}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <StatusBadge tone={kindTone(item.kind)}>
                                {KIND_LABEL[item.kind] ?? item.kind}
                              </StatusBadge>
                              {linkedExc ? (
                                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                  {linkedExc.relative_pct >= 0 ? "+" : ""}
                                  {linkedExc.relative_pct.toFixed(1)}%
                                </span>
                              ) : null}
                              {linkedOpenActs > 0 ? (
                                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                                  {linkedOpenActs} {linkedOpenActs === 1 ? "action" : "actions"}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                            {item.minutes_alloc}′
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Panel>

              {/* Right column: #agItem */}
              {activeItem ? (
                <ActiveItemWorkspace
                  key={`${activeItem.key}-${activeItem.notes ?? ""}-${activeItem.decision ?? ""}`}
                  period={detail.period}
                  item={activeItem}
                  exception={activeItem.ref_id ? exceptionById.get(activeItem.ref_id) ?? null : null}
                  monitoringExceptions={monitoringExceptions}
                  staleSources={detail.staleSources ?? []}
                  actions={detail.actions}
                  meetingOpen={meetingOpen}
                  frozen={frozen}
                  isSaving={review.isSaving}
                  onStartMeeting={handleStartMeeting}
                  onSaveItem={review.saveItem}
                  onMarkNext={handleMarkNext}
                  onAddAction={review.addAction}
                  onCloseAction={review.closeAction}
                  onDeleteAction={review.removeAction}
                />
              ) : (
                <Panel className="p-6 text-center text-sm text-muted-foreground">
                  Select an agenda item on the left.
                </Panel>
              )}
            </div>
          )}

          {/* #actTable — Action items from reviews */}
          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight">
                Action items from reviews{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  · {openActions.length} open
                  {overdueActions.length > 0 ? (
                    <span className="font-medium text-destructive">, {overdueActions.length} overdue</span>
                  ) : null}
                </span>
              </h2>
            </div>
            <Panel className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Meeting</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                    {!frozen ? <TableHead className="w-9" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.actions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={frozen ? 6 : 7} className="py-6 text-center text-xs text-muted-foreground">
                        No action items yet. Add them during a review.
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail.actions.map((action) => {
                      const done = action.status === "DONE";
                      const late = !done && Boolean(action.due_date && action.due_date < today);
                      return (
                        <TableRow key={action.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={done}
                              disabled={done || review.isSaving}
                              onChange={() => {
                                if (!done) void review.closeAction(action.id);
                              }}
                              aria-label={`Mark ${action.title} done`}
                              className="h-4 w-4 accent-primary"
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {companyLabel} · {detail.period}
                          </TableCell>
                          <TableCell className={cn("text-sm", done && "text-muted-foreground line-through")}>
                            {action.title}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{ownerLabel(action)}</TableCell>
                          <TableCell className={cn("font-mono text-xs tabular-nums", late && "font-medium text-destructive")}>
                            {action.due_date ? displayDay(action.due_date) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <StatusBadge tone={done ? "success" : late ? "danger" : "info"}>
                              {done ? "Done" : late ? "Overdue" : "Open"}
                            </StatusBadge>
                          </TableCell>
                          {!frozen ? (
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                disabled={review.isSaving}
                                aria-label={`Delete action ${action.title}`}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={async () => {
                                  await review.removeAction(action.id);
                                  toast.success("Action item removed");
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Panel>
          </div>

          {/* General meeting minutes summary (collapsed/compact when meeting is open) */}
          {meetingOpen ? (
            <Panel className="space-y-2.5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <MicroLabel>General meeting minutes (optional summary)</MicroLabel>
                {!frozen ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={review.isSaving}
                    onClick={async () => {
                      await review.saveMeeting({ attendees: attendanceValue, minutes: minutesValue });
                      toast.success("Meeting summary saved");
                    }}
                  >
                    Save summary
                  </Button>
                ) : null}
              </div>
              <Textarea
                value={minutesValue}
                onChange={(event) => setMinutesDraft(event.target.value)}
                rows={3}
                placeholder="Overall takeaways, cross-company decisions, or next meeting date."
                aria-label="General meeting minutes"
                readOnly={frozen}
                className="min-h-[72px] resize-y text-sm read-only:cursor-not-allowed read-only:opacity-60"
              />
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
