"use client";

import { useMemo, useState } from "react";
import { Download, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatNumber } from "../services/engine";
import { useData } from "../hooks/useData";
import { Notice } from "./Notice";
import { ReadingDialog } from "./ReadingDialog";
import {
  BoardHeader,
  Callout,
  Dot,
  MicroLabel,
  Panel,
  PanelHead,
  SectionHeading,
  Stat,
} from "@/modules/financial-management/management-analytics/shared/BoardKit";
import { BarList, Meter, StackBar } from "@/modules/financial-management/management-analytics/shared/Charts";
import { StatusBadge } from "./StatusBadge";
import { exportUrl } from "../providers/dataApi";
import type { SourceRow } from "../types";
import { phtDisplayStamp, phtToday } from "../pht";

const CADENCE_LABEL: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
};

const GATE_LABEL: Record<string, string> = {
  COMPLETENESS: "Completeness",
  DUPLICATION: "Duplication",
  REFERENTIAL: "Referential integrity",
  RECONCILIATION: "Reconciliation",
  INTERCOMPANY: "Intercompany matching",
};

const RESULT_LABEL: Record<string, string> = { PASS: "Pass", FAIL: "Fail", NOT_RUN: "Not run" };

const GATE_TONE: Record<string, "success" | "danger" | "neutral"> = {
  PASS: "success",
  FAIL: "danger",
  NOT_RUN: "neutral",
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The four stages a reading travels, in the order the reference prototype shows them. */
const PHASES = [
  { name: "Ingestion & Extraction", note: "Automated pipelines" },
  { name: "Transformation & QA", note: "Validation gates" },
  { name: "Storage & Modeling", note: "One reading per measure" },
  { name: "Presentation & Action", note: "Decision delivery" },
] as const;

function slaLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "no limit recorded";
  return minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes)} min`;
}

/** The month the shared toolbar wrote into the address bar, or the PHT month it defaults to. */
function readUrlPeriod(): string {
  const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("period");
  return requested && MONTH.test(requested) ? requested : phtToday().slice(0, 7);
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n, 0)} ${n === 1 ? one : many}`;
}

export function DataModule() {
  const data = useData(readUrlPeriod());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefillCompany, setPrefillCompany] = useState<string | undefined>();
  const [phase, setPhase] = useState(0);
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullErrors, setPullErrors] = useState<Record<string, string>>({});

  const payload = data.data;
  const coverage = payload?.coverage;

  async function pullSource(code: string, name: string) {
    setPulling(code);
    setPullErrors((current) => {
      const next = { ...current };
      delete next[code];
      return next;
    });
    try {
      const result = await data.pullSource(code);
      toast.success(`${name} re-read: ${count(result.readings, "reading")}.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The source could not be re-read.";
      setPullErrors((current) => ({ ...current, [code]: message }));
      toast.error(message);
    } finally {
      setPulling(null);
    }
  }

  const tiles = useMemo(
    () => [
      {
        label: "Readings this month",
        value: coverage ? `${formatNumber(coverage.readings, 0)} / ${formatNumber(coverage.expected, 0)}` : "not recorded",
        hint: coverage && coverage.expected > 0 ? `${formatNumber((coverage.readings / coverage.expected) * 100, 0)}% of the catalog` : "Nothing to read",
      },
      {
        label: "Missing",
        value: coverage ? formatNumber(coverage.missing, 0) : "not recorded",
        hint: "Measures with no reading for the month",
      },
      {
        label: "Provisional",
        value: coverage ? formatNumber(coverage.provisional, 0) : "not recorded",
        hint: "Readings still open to revision",
      },
      {
        label: "Duplicates",
        value: coverage ? formatNumber(coverage.duplicates, 0) : "not recorded",
        hint: "Extra rows for the same measure and month",
      },
    ],
    [coverage],
  );

  const freshFeeds = payload ? payload.sources.filter((source) => source.fresh).length : 0;
  const passedGates = payload ? payload.gates.filter((gate) => gate.status === "PASS").length : 0;
  const lastRun = payload?.runs[0] ?? null;
  const measuredFeeds = payload
    ? payload.sources.filter((source): source is SourceRow & { ageMinutes: number } => source.ageMinutes !== null)
    : [];
  const unmeasuredFeeds = payload ? payload.sources.filter((source) => source.ageMinutes === null) : [];

  /** The row action: one feed at a time, and a feed with nothing behind it stays disabled with the reason. */
  function pullAction(source: SourceRow) {
    const error = pullErrors[source.code];
    const busy = pulling === source.code;
    const title =
      source.readings === 0
        ? `${source.name} has no readings in this build, so there is nothing to re-pull.`
        : pulling !== null && !busy
          ? "Another feed is still being re-read."
          : `Re-read ${source.name} and log the run.`;
    return (
      <div className="inline-flex flex-col items-end gap-1">
        <Button
          size="sm"
          variant="secondary"
          className="min-h-9"
          disabled={source.readings === 0 || pulling !== null}
          title={title}
          onClick={() => void pullSource(source.code, source.name)}
        >
          <RefreshCw className={busy ? "mr-1.5 size-3.5 animate-spin" : "mr-1.5 size-3.5"} />
          {busy ? "Pulling" : "Re-pull"}
        </Button>
        {error ? <p className="max-w-[220px] text-right text-[11px] text-destructive">{error}</p> : null}
      </div>
    );
  }

  /** What each stage has to show for itself, built from the payload the screen already has. */
  const phaseItems = useMemo(() => {
    if (!payload || !coverage) return [];
    if (phase === 0) {
      return payload.sources.map((source) => ({
        label: source.name,
        value: CADENCE_LABEL[source.cadence] ?? source.cadence,
      }));
    }
    if (phase === 1) {
      return payload.gates.map((gate) => ({
        label: GATE_LABEL[gate.gate] ?? gate.gate,
        value: RESULT_LABEL[gate.status] ?? gate.status,
      }));
    }
    if (phase === 2) {
      return [
        { label: "Measures read", value: `${formatNumber(coverage.readings, 0)} of ${formatNumber(coverage.expected, 0)}` },
        { label: "Missing", value: formatNumber(coverage.missing, 0) },
        { label: "Provisional", value: formatNumber(coverage.provisional, 0) },
        { label: "Duplicates", value: formatNumber(coverage.duplicates, 0) },
      ];
    }
    return [
      { label: "Checks passing", value: `${formatNumber(passedGates, 0)} of ${formatNumber(payload.gates.length, 0)}` },
      { label: "Gaps to close", value: count(coverage.missingKpis.length, "measure") },
      { label: "Check runs logged", value: formatNumber(payload.runs.length, 0) },
    ];
  }, [payload, coverage, phase, passedGates]);

  const phaseStatus = [
    `${formatNumber(freshFeeds, 0)} of ${formatNumber(payload?.sources.length ?? 0, 0)} feeds fresh`,
    `${formatNumber(passedGates, 0)} of ${formatNumber(payload?.gates.length ?? 0, 0)} gates pass`,
    `${formatNumber(coverage?.readings ?? 0, 0)} of ${formatNumber(coverage?.expected ?? 0, 0)} measures stored`,
    `${count(coverage?.missingKpis.length ?? 0, "gap")} to close`,
  ];

  const failedGates = payload?.gates.filter((gate) => gate.status !== "PASS") ?? [];

  return (
    <div className="space-y-4">
      <BoardHeader
        title="Data Life Cycle"
        subtitle="From each company's source systems to the decision pack. Freshness and validation results follow every figure that depends on them."
        meta={
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
            {payload?.period ?? "latest month"}
          </span>
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!payload}
              onClick={() => {
                if (!payload) return;
                window.open(exportUrl(payload.period), "_blank", "noopener");
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Export the month
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setPrefillCompany(undefined);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Record a reading
            </Button>
          </div>
        }
      />

      {data.error ? (
        <Notice tone="danger" title="The data desk could not be read">
          {data.error}
        </Notice>
      ) : null}

      {/* Connected 4-phase horizontal pipeline strip matching reference .pipe */}
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-border/60">
        {PHASES.map((item, index) => (
          <button
            key={item.name}
            type="button"
            aria-pressed={phase === index}
            onClick={() => setPhase(index)}
            className={
              phase === index
                ? "bg-foreground p-4 text-left text-background transition-colors"
                : "bg-card p-4 text-left transition-colors hover:bg-muted/40"
            }
          >
            <span className={phase === index ? "font-mono text-[11px] uppercase tracking-wider opacity-75" : "font-mono text-[11px] uppercase tracking-wider text-muted-foreground"}>
              Phase {index + 1} →
            </span>
            <p className="mt-1 text-sm font-semibold leading-tight">{item.name}</p>
            <p className={phase === index ? "mt-0.5 text-xs opacity-80" : "mt-0.5 text-xs text-muted-foreground"}>{item.note}</p>
            <p className={phase === index ? "mt-2 border-t border-background/20 pt-2 text-[11.5px] tabular-nums opacity-85" : "mt-2 border-t border-dashed border-border pt-2 text-[11.5px] tabular-nums text-muted-foreground"}>
              {phaseStatus[index]}
            </p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel className="p-4">
          <h2 className="text-sm font-semibold leading-tight">
            Phase {phase + 1}: {PHASES[phase].name}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {phase === 0
              ? "Every feed that carries a measure, and how often it promises to answer."
              : phase === 1
                ? "Completeness, reconciliation and duplication, judged on the current month."
                : phase === 2
                  ? "One reading per measure and month, with the gaps left open."
                  : "What reaches the reader once the reading is stored and checked."}
          </p>
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-border/50">
              {phaseItems.map((item) => (
                <tr key={item.label}>
                  <td className="py-1.5 pr-3 font-medium">{item.label}</td>
                  <td className="py-1.5 text-right text-xs text-muted-foreground">{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {phaseItems.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">Nothing to list yet.</p> : null}
        </Panel>

        <Panel>
          <PanelHead
            title="Phase 2 validation gates"
            description={lastRun?.run_at ? `Last run ${phtDisplayStamp(lastRun.run_at)} · ${formatNumber(passedGates, 0)} of ${formatNumber(payload?.gates.length ?? 0, 0)} passed` : "No gate has run for this month yet"}
            right={
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  void data
                    .checks()
                    .then((result) => {
                      const failed = result.gates.filter((gate) => gate.status !== "PASS");
                      if (failed.length === 0) {
                        toast.success(`All ${result.gates.length} checks pass for ${result.period}.`);
                        return;
                      }
                      // A gate that failed is the news; a green tick would hide it.
                      toast.warning(
                        `${failed.length} of ${result.gates.length} checks need attention for ${result.period}: ${failed.map((gate) => GATE_LABEL[gate.gate] ?? gate.gate).join(", ")}.`,
                      );
                    })
                    .catch((cause: unknown) => toast.error(cause instanceof Error ? cause.message : "The checks did not run."))
                }
                disabled={data.isSaving || !payload}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${data.isSaving ? "animate-spin" : ""}`} />
                Run checks
              </Button>
            }
          />
          <ul className="divide-y divide-border/50">
            {(payload?.gates ?? []).map((gate) => (
              <li key={gate.gate} className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-1.5 shrink-0">
                  <Dot tone={GATE_TONE[gate.status] === "success" ? "success" : GATE_TONE[gate.status] === "danger" ? "danger" : "muted"} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{GATE_LABEL[gate.gate] ?? gate.gate}</p>
                  <p className="text-xs text-muted-foreground">{gate.detail}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatNumber(gate.rowsOk, 0)} ok · {formatNumber(gate.rowsFailed, 0)} failed
                  </span>
                  <StatusBadge tone={GATE_TONE[gate.status] ?? "neutral"}>{RESULT_LABEL[gate.status] ?? gate.status}</StatusBadge>
                </div>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3">
            {payload ? (
              failedGates.length === 0 ? (
                <Callout tone="success" title="All gates passed.">
                  The stored readings reconcile with their sources for {payload.period}.
                </Callout>
              ) : (
                <Callout
                  tone="warning"
                  title={`${count(failedGates.length, "gate")} still open: ${failedGates.map((gate) => GATE_LABEL[gate.gate] ?? gate.gate).join(", ")}.`}
                >
                  Figures built on these measures carry the caveat until the gate passes.
                </Callout>
              )
            ) : null}
          </div>
        </Panel>
      </div>

      <SectionHeading
        title="Source freshness"
        description="A measure fed by a stale source is flagged where it is read, not here."
      />
      <Panel>
        <div className="hidden overflow-x-auto min-[1300px]:block">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Source</th>
                <th className="px-4 py-2.5 text-left font-medium">Cadence</th>
                <th className="px-4 py-2.5 text-left font-medium">Last refresh</th>
                <th className="px-4 py-2.5 text-right font-medium">Freshness SLA</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Feeds</th>
                <th className="px-4 py-2.5 text-left font-medium">Steward</th>
                <th className="px-4 py-2.5 text-right font-medium">Refresh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {!payload && data.isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`loading-${index}`}>
                      <td colSpan={8} className="px-4 py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </td>
                    </tr>
                  ))
                : null}
              {(payload?.sources ?? []).map((source) => (
                <tr key={source.code}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{source.name}</span>
                    {source.name.toUpperCase() === source.code ? null : (
                      <span className="ml-2 text-xs text-muted-foreground">{source.code}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{CADENCE_LABEL[source.cadence] ?? source.cadence}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {source.last_sync_at ? phtDisplayStamp(source.last_sync_at) : "No sync recorded"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{slaLabel(source.sla_minutes)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={source.fresh ? "success" : "warning"}>{source.fresh ? "Fresh" : "Stale"}</StatusBadge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {source.feeds.kpis === 0
                      ? "Nothing this month"
                      : `${formatNumber(source.feeds.kpis, 0)} KPI${source.feeds.kpis === 1 ? "" : "s"} · ${formatNumber(source.feeds.companies, 0)} ${source.feeds.companies === 1 ? "company" : "companies"}`}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-2.5 text-muted-foreground" title={source.steward ?? undefined}>
                    {source.steward ?? "No steward"}
                  </td>
                  <td className="px-4 py-2.5 text-right align-top">
                    {pullAction(source)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-border min-[1300px]:hidden">
          {!payload && data.isLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <li key={`loading-${index}`} className="px-4 py-3">
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                </li>
              ))
            : null}
          {(payload?.sources ?? []).map((source) => (
            <li key={source.code} className="space-y-1.5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={source.name}>
                    {source.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {source.code} · {CADENCE_LABEL[source.cadence] ?? source.cadence} · SLA {slaLabel(source.sla_minutes)}
                  </p>
                </div>
                <StatusBadge tone={source.fresh ? "success" : "warning"}>{source.fresh ? "Fresh" : "Stale"}</StatusBadge>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate" title={source.steward ?? undefined}>
                  {source.steward ?? "No steward"}
                </span>
                <span className="tabular-nums">
                  {source.last_sync_at ? phtDisplayStamp(source.last_sync_at) : "No sync recorded"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {source.feeds.kpis === 0
                  ? "Feeds nothing this month"
                  : `Feeds ${formatNumber(source.feeds.kpis, 0)} KPI${source.feeds.kpis === 1 ? "" : "s"} across ${formatNumber(source.feeds.companies, 0)} ${source.feeds.companies === 1 ? "company" : "companies"}`}
              </p>
              <div className="flex justify-end">{pullAction(source)}</div>
            </li>
          ))}
        </ul>
        {(payload?.sources.length ?? 0) === 0 && !(data.isLoading && !payload) ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            {payload
              ? "No feed is registered yet, so there is nothing to check for freshness."
              : "The feeds could not be listed for this month, so the table would be empty rather than clean."}
          </p>
        ) : null}
      </Panel>

      <Panel className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((tile) => (
            <Stat key={tile.label} label={tile.label} value={tile.value} note={tile.hint} />
          ))}
        </div>
        {coverage ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <MicroLabel>Readings for {payload?.period ?? "the month"}</MicroLabel>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {coverage.expected > 0 ? Math.round((coverage.readings / coverage.expected) * 100) : 0}% of the catalogue
              </span>
            </div>
            <Meter
              value={coverage.expected > 0 ? (coverage.readings / coverage.expected) * 100 : 0}
              tone={coverage.missing > 0 ? "warning" : "success"}
              height={10}
            />
            <div className="pt-1">
              <StackBar
                height={8}
                legend
                segments={[
                  { label: "Read", value: coverage.readings, tone: "success" },
                  { label: "Provisional", value: coverage.provisional, tone: "primary" },
                  { label: "Missing", value: coverage.missing, tone: "warning" },
                  { label: "Duplicates", value: coverage.duplicates, tone: "danger" },
                ]}
              />
            </div>
          </div>
        ) : null}
      </Panel>

      {coverage && coverage.readings === 0 && coverage.expected > 0 ? (
        <Notice tone="info" title={`Nothing has been read for ${payload?.period ?? "this month"} yet`}>
          All {formatNumber(coverage.expected, 0)} measures in the catalog are still missing a reading, so the figures below are
          absences rather than zeroes. Record one here, or pick another month in the toolbar.
          {payload?.nearestPeriod ? ` The nearest month with readings is ${payload.nearestPeriod}.` : null}
        </Notice>
      ) : null}

      {payload && payload.sources.length > 0 ? (
        <Panel>
          <PanelHead
            title="Feed latency"
            description="Minutes since each feed last answered, against the cadence it promised."
            count={count(payload.sources.length, "feed")}
          />
          <div className="px-4 py-3">
            {measuredFeeds.length > 0 ? (
              <>
                <BarList
                  rows={measuredFeeds.map((source) => ({
                    label: source.code,
                    value: source.ageMinutes,
                    note: source.fresh ? "fresh" : "stale",
                    tone: source.fresh ? "success" : "warning",
                  }))}
                  dp={0}
                  unit=" min"
                />
                {unmeasuredFeeds.length > 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {count(unmeasuredFeeds.length, "feed")} of {formatNumber(payload.sources.length, 0)} have never recorded a
                    sync, so their latency is unknown rather than zero: {unmeasuredFeeds.map((source) => source.code).join(", ")}.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No feed has recorded a sync, so latency is unknown for all {formatNumber(payload.sources.length, 0)} feeds. A
                re-pull stamps the first one.
              </p>
            )}
          </div>
        </Panel>
      ) : null}

      {coverage && coverage.missingKpis.length > 0 ? (
        <Panel>
          <PanelHead
            title="Still missing"
            description="Measures with no reading for this month. Recording one closes the gap."
            count={count(coverage.missingKpis.length, "measure")}
          />
          <ul className="divide-y divide-border/50">
            {coverage.missingKpis.map((kpi) => (
              <li key={`${kpi.companyCode}-${kpi.kpi_key}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{kpi.name}</span>
                  <span className="ml-2 text-[11px] uppercase text-muted-foreground">{kpi.companyCode}</span>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={kpi.kpi_key}>
                    {kpi.kpi_key}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={() => {
                    setPrefillCompany(kpi.companyCode);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel>
        <PanelHead
          title="Recent runs"
          description="Every check run is kept, so a month can be shown as it was judged."
          count={count(payload?.runs.length ?? 0, "run")}
        />
        {payload && payload.runs.length > 0 ? (
          <ul className="divide-y divide-border/50">
            {payload.runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">
                    {run.gate ? GATE_LABEL[run.gate] ?? run.gate : run.kind === "VALIDATION" ? "Validation" : run.kind}
                  </span>
                  <span className="ml-2 text-[11px] tabular-nums text-muted-foreground">{run.period ?? "no period recorded"}</span>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={run.detail ?? undefined}>
                    {run.detail}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] tabular-nums text-muted-foreground">{run.run_at ? phtDisplayStamp(run.run_at) : "not recorded"}</span>
                  <StatusBadge tone={GATE_TONE[run.status ?? ""] ?? "neutral"}>
                    {RESULT_LABEL[run.status ?? ""] ?? run.status ?? "not run"}
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">No checks have run yet for this month.</p>
        )}
      </Panel>

      <ReadingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        data={payload}
        defaultCompanyCode={prefillCompany ?? undefined}
        defaultPeriod={payload?.period ?? ""}
        onSaved={() => void data.reload()}
      />
    </div>
  );
}
