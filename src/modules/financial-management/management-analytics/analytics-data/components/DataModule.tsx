"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Download, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatNumber } from "../services/engine";
import { useData } from "../hooks/useData";
import { Notice } from "./Notice";
import { ReadingDialog } from "./ReadingDialog";
import { ErpDataHealthPanel } from "./ErpDataHealthPanel";
import {
  BoardHeader,
  Callout,
  Dot,
  ErpTags,
  Panel,
  PanelHead,
  Stat,
} from "./BoardKit";
import { BarList, Meter, StackBar } from "./Charts";
import { StatusBadge } from "./StatusBadge";
import { ERP_INPUT_LABELS, isPeriod, PERIOD_PARAM } from "./analytics-screens";
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

const PHASES = [
  { name: "Ingestion & Extraction", note: "ERP & subsidiary pipelines" },
  { name: "Transformation & QA", note: "Validation & orphan gates" },
  { name: "Storage & Modeling", note: "Single curated reading per KPI" },
  { name: "Presentation & Action", note: "Decision packs & alerts" },
] as const;

type DiagTab = "coverage" | "latency" | "runs";

interface ErpPreviewReading {
  kpiKey: string;
  label?: string;
  period: string;
  value: number | null;
  unit?: string | null;
  basis?: string;
  inputs?: Record<string, unknown> | null;
}

const PESO_INPUT_KEYS = new Set([
  "actualOpex",
  "fromPostedDisbursements",
  "fromAdjustingEntries",
  "fromCollections",
  "releasedNotPosted",
  "otherUnposted",
  "asInIncomeStatement",
  "approvedBudget",
  "tripCost",
]);

function slaLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  return minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes)} min`;
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n, 0)} ${n === 1 ? one : many}`;
}

function formatInputVal(key: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") {
    if (PESO_INPUT_KEYS.has(key)) {
      return `₱${val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (key.toLowerCase().includes("percent") || key.toLowerCase().includes("rate")) {
      return `${val.toFixed(2)}%`;
    }
    return Number.isInteger(val) ? val.toLocaleString("en-PH") : val.toLocaleString("en-PH", { maximumFractionDigits: 2 });
  }
  return String(val);
}

export function DataModule() {
  const searchParams = useSearchParams();
  const requestedPeriod = searchParams.get(PERIOD_PARAM);
  const period = isPeriod(requestedPeriod) ? requestedPeriod : phtToday().slice(0, 7);

  const data = useData(period);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefillCompany, setPrefillCompany] = useState<string | undefined>();
  const [phase, setPhase] = useState(0);
  const [diagTab, setDiagTab] = useState<DiagTab>("coverage");
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullErrors, setPullErrors] = useState<Record<string, string>>({});

  const [erpLoading, setErpLoading] = useState(false);
  const [erpError, setErpError] = useState<string | null>(null);
  const [erpReadings, setErpReadings] = useState<ErpPreviewReading[]>([]);
  const [expandedErpKey, setExpandedErpKey] = useState<string | null>(null);

  const payload = data.data;
  const coverage = payload?.coverage;

  const loadErpPreview = useCallback(async (targetPeriod: string) => {
    setErpLoading(true);
    setErpError(null);
    try {
      const response = await fetch(`/api/fm/management-analytics/erp-readings?period=${encodeURIComponent(targetPeriod)}`, {
        cache: "no-store",
      });
      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { readings?: ErpPreviewReading[] };
        error?: string;
      };
      if (!response.ok || json.success === false) {
        throw new Error(json.error ?? `ERP endpoint returned HTTP ${response.status}.`);
      }
      setErpReadings(json.data?.readings ?? []);
    } catch (cause) {
      setErpReadings([]);
      setErpError(cause instanceof Error ? cause.message : "Could not reach ERP endpoint.");
    } finally {
      setErpLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadErpPreview(period);
  }, [period, loadErpPreview]);

  async function pullSource(code: string, name: string) {
    setPulling(code);
    setPullErrors((current) => {
      const next = { ...current };
      delete next[code];
      return next;
    });
    try {
      const result = await data.pullSource(code);
      if (result.saved !== undefined) {
        toast.success(
          `${name} synced for ${period}: ${count(result.saved, "reading")} saved${
            result.skipped ? `, ${result.skipped} skipped` : ""
          }.`,
        );
      } else {
        toast.success(`${name} re-read: ${count(result.readings, "reading")}.`);
      }
      if (code.toUpperCase() === "ERP") void loadErpPreview(period);
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
        value: coverage ? `${formatNumber(coverage.readings, 0)} / ${formatNumber(coverage.expected, 0)}` : "—",
        hint: coverage && coverage.expected > 0 ? `${formatNumber((coverage.readings / coverage.expected) * 100, 0)}% of the catalog` : "—",
      },
      {
        label: "Missing",
        value: coverage ? formatNumber(coverage.missing, 0) : "—",
        hint: "Measures without a reading",
      },
      {
        label: "Provisional",
        value: coverage ? formatNumber(coverage.provisional, 0) : "—",
        hint: "Still open to revision",
      },
      {
        label: "Duplicates",
        value: coverage ? formatNumber(coverage.duplicates, 0) : "—",
        hint: "Extra rows in the month",
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
  const failedGates = payload?.gates.filter((gate) => gate.status !== "PASS") ?? [];
  const showOrphanGuidance = failedGates.length > 0 || (coverage?.missing ?? 0) > 0;

  function pullAction(source: SourceRow) {
    const error = pullErrors[source.code];
    const busy = pulling === source.code;
    const isErp = source.code.toUpperCase() === "ERP";
    const disabled = (!isErp && source.readings === 0) || pulling !== null;
    const title = isErp
      ? `Pull live ERP readings for ${period} into Directus.`
      : source.readings === 0
        ? `${source.name} has no stored readings yet.`
        : pulling !== null && !busy
          ? "Another feed is still running."
          : `Re-read ${source.name} and log the sync.`;

    return (
      <div className="inline-flex flex-col items-end gap-1">
        <Button
          size="sm"
          variant={isErp ? "default" : "outline"}
          className="h-8 gap-1.5"
          disabled={disabled}
          title={title}
          onClick={() => void pullSource(source.code, source.name)}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
          {busy ? "Pulling" : "Re-pull"}
        </Button>
        {error ? <p className="max-w-[220px] text-right text-[11px] text-destructive">{error}</p> : null}
      </div>
    );
  }

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
    `${formatNumber(coverage?.readings ?? 0, 0)} of ${formatNumber(coverage?.expected ?? 0, 0)} stored`,
    `${count(coverage?.missingKpis.length ?? 0, "gap")} to close`,
  ];

  return (
    <div className="space-y-4">
      <BoardHeader
        eyebrow="Management Analytics · Data Pipeline"
        title="Data Life Cycle & Feeds"
        subtitle="Pipeline from ERP and operating source systems to curated readings. Validation results and source freshness follow every downstream figure."
        meta={
          <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
            {period}
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
              Export month CSV
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
              Record reading
            </Button>
          </div>
        }
      />

      {data.error ? (
        <Notice tone="danger" title="The data desk could not be read">
          {data.error}
        </Notice>
      ) : null}

      <ErpDataHealthPanel period={period} />

      {/* Band 1: 4-phase Pipeline Strip */}
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-border/60">
        {PHASES.map((item, index) => {
          const active = phase === index;
          return (
            <button
              key={item.name}
              type="button"
              aria-pressed={active}
              onClick={() => setPhase(index)}
              className={cn(
                "p-4 text-left transition-colors",
                active
                  ? "bg-teal-800 text-white dark:bg-teal-400 dark:text-slate-950"
                  : "bg-card hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[11px] uppercase tracking-wider",
                  active ? "opacity-80" : "text-muted-foreground",
                )}
              >
                Phase {index + 1} →
              </span>
              <p className="mt-1 text-sm font-semibold leading-tight">{item.name}</p>
              <p className={cn("mt-0.5 text-xs", active ? "opacity-85" : "text-muted-foreground")}>{item.note}</p>
              <p
                className={cn(
                  "mt-2 border-t pt-2 font-mono text-[11.5px] tabular-nums",
                  active ? "border-white/25 opacity-95 dark:border-slate-950/20" : "border-dashed border-border text-muted-foreground",
                )}
              >
                {phaseStatus[index]}
              </p>
            </button>
          );
        })}
      </div>

      {/* Band 2: [Stage Inspector & Map Orphans | Validation Gates] */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel className="space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold leading-tight">
              Phase {phase + 1}: {PHASES[phase].name}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {phase === 0
                ? "Registered upstream systems and expected reporting cadence."
                : phase === 1
                  ? "Automated QA gates evaluated against stored monthly readings."
                  : phase === 2
                    ? "Stored reading coverage, provisional flags, and duplicate guard."
                    : "Downstream scorecards and remediation items driven by this month."}
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border/50">
              {phaseItems.map((item) => (
                <tr key={item.label}>
                  <td className="py-1.5 pr-3 text-xs font-medium">{item.label}</td>
                  <td className="py-1.5 text-right font-mono text-xs text-muted-foreground">{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {phaseItems.length === 0 ? <p className="text-xs text-muted-foreground">—</p> : null}

          {showOrphanGuidance ? (
            <Callout tone="warning" title="Map unlinked codes & close missing measures">
              If an ERP or subsystem feed fails Referential Integrity or leaves expected KPIs blank, verify the
              measure’s <code className="font-mono text-[11px]">kpi_key</code> and source mapping in{" "}
              <strong className="font-medium">Governance → KPI Catalog &amp; Rules</strong>, or log a curated manual
              reading via <strong className="font-medium">Record reading</strong>.
            </Callout>
          ) : null}
        </Panel>

        <Panel>
          <PanelHead
            title="Validation Gates"
            description={
              lastRun?.run_at
                ? `Last run ${phtDisplayStamp(lastRun.run_at)} · ${formatNumber(passedGates, 0)} of ${formatNumber(payload?.gates.length ?? 0, 0)} passed`
                : "No gate run recorded for this month yet"
            }
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
                      toast.warning(
                        `${failed.length} of ${result.gates.length} checks need attention: ${failed.map((gate) => GATE_LABEL[gate.gate] ?? gate.gate).join(", ")}.`,
                      );
                    })
                    .catch((cause: unknown) => toast.error(cause instanceof Error ? cause.message : "Checks did not run."))
                }
                disabled={data.isSaving || !payload}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", data.isSaving && "animate-spin")} />
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
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatNumber(gate.rowsOk, 0)} ok · {formatNumber(gate.rowsFailed, 0)} fail
                  </span>
                  <StatusBadge tone={GATE_TONE[gate.status] ?? "neutral"}>{RESULT_LABEL[gate.status] ?? gate.status}</StatusBadge>
                </div>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3">
            {payload ? (
              failedGates.length === 0 ? (
                <Callout tone="success" title="All validation gates passed">
                  Stored readings reconcile cleanly for {payload.period}.
                </Callout>
              ) : (
                <Callout
                  tone="warning"
                  title={`${count(failedGates.length, "gate")} open: ${failedGates.map((gate) => GATE_LABEL[gate.gate] ?? gate.gate).join(", ")}.`}
                >
                  Downstream figures carry provisional flags until resolved.
                </Callout>
              )
            ) : null}
          </div>
        </Panel>
      </div>

      {/* Live ERP Readings Preview */}
      <Panel>
        <PanelHead
          title="Live ERP Readings Preview"
          description={`Direct preview from ERP Server (/api/management-analytics/kpi-readings) for ${period}.`}
          count={`${erpReadings.length} metrics`}
          right={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                disabled={erpLoading}
                onClick={() => void loadErpPreview(period)}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", erpLoading && "animate-spin")} />
                Refresh preview
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5"
                disabled={pulling !== null}
                onClick={() => void pullSource("ERP", "ERP Server")}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", pulling === "ERP" && "animate-spin")} />
                {pulling === "ERP" ? "Syncing ERP…" : `Pull ERP into ${period}`}
              </Button>
            </div>
          }
        />
        {erpLoading ? (
          <div className="flex items-center gap-2 border-t border-border/60 px-4 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Querying ERP Server for {period}…
          </div>
        ) : erpError ? (
          <div className="border-t border-border/60 p-4">
            <Callout tone="warning" title="ERP preview unavailable">
              {erpError}
            </Callout>
          </div>
        ) : erpReadings.length === 0 ? (
          <p className="border-t border-border/60 px-4 py-6 text-xs text-muted-foreground">
            No ERP readings returned for {period}.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-border/60">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/35 text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 px-2 py-2" />
                  <th className="px-3 py-2 text-left font-medium">KPI Key</th>
                  <th className="px-3 py-2 text-left font-medium">Qualifiers</th>
                  <th className="px-3 py-2 text-right font-medium">Live Value</th>
                  <th className="px-3 py-2 text-left font-medium">Basis</th>
                  <th className="px-3 py-2 text-left font-medium">Period</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {erpReadings.map((reading) => {
                  const isOpen = expandedErpKey === reading.kpiKey;
                  const inputs = reading.inputs ?? null;
                  const formula = typeof inputs?.formula === "string" ? inputs.formula : null;
                  const detailPairs = inputs
                    ? Object.entries(inputs).filter(([k]) => k !== "formula")
                    : [];
                  return (
                    <>
                      <tr
                        key={reading.kpiKey}
                        className="cursor-pointer hover:bg-muted/35"
                        onClick={() => setExpandedErpKey(isOpen ? null : reading.kpiKey)}
                      >
                        <td className="px-2 py-2.5 text-center text-muted-foreground">
                          {detailPairs.length > 0 || formula ? (
                            isOpen ? <ChevronDown className="inline h-3.5 w-3.5" /> : <ChevronRight className="inline h-3.5 w-3.5" />
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs font-medium">{reading.kpiKey}</td>
                        <td className="px-3 py-2.5">
                          <ErpTags kpiKey={reading.kpiKey} sourceCodes="ERP" basis={reading.basis} compact />
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold tabular-nums">
                          {reading.value === null ? "—" : `${reading.value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}${reading.unit ? ` ${reading.unit}` : ""}`}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{reading.basis ?? "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{reading.period}</td>
                      </tr>
                      {isOpen && (formula || detailPairs.length > 0) ? (
                        <tr key={`${reading.kpiKey}-inputs`} className="bg-muted/20">
                          <td colSpan={6} className="px-6 py-3">
                            {formula ? (
                              <p className="mb-2 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Formula:</span> {formula}
                              </p>
                            ) : null}
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
                              {detailPairs.map(([k, v]) => (
                                <div key={k} className="flex items-baseline justify-between gap-2 text-[11px]">
                                  <span className="truncate text-muted-foreground" title={ERP_INPUT_LABELS[k] ?? k}>
                                    {ERP_INPUT_LABELS[k] ?? k}
                                  </span>
                                  <span className="font-mono font-medium tabular-nums">{formatInputVal(k, v)}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Band 3: Source Freshness */}
      <Panel>
        <PanelHead
          title="Source Freshness"
          description="Registered source adapters, promised SLA windows, and last successful sync."
          count={`${payload?.sources.length ?? 0} sources`}
        />
        <div className="hidden overflow-x-auto border-t border-border/60 md:block">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Source</th>
                <th className="px-4 py-2.5 text-left font-medium">Cadence</th>
                <th className="px-4 py-2.5 text-left font-medium">Last refresh</th>
                <th className="px-4 py-2.5 text-right font-medium">SLA</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Coverage</th>
                <th className="px-4 py-2.5 text-left font-medium">Steward</th>
                <th className="px-4 py-2.5 text-right font-medium">Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {(payload?.sources ?? []).map((source) => (
                <tr key={source.code}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{source.name}</span>
                    {source.name.toUpperCase() === source.code ? null : (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{source.code}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{CADENCE_LABEL[source.cadence] ?? source.cadence}</td>
                  <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                    {source.last_sync_at ? phtDisplayStamp(source.last_sync_at) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">{slaLabel(source.sla_minutes)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={source.fresh ? "success" : "warning"}>{source.fresh ? "Fresh" : "Stale"}</StatusBadge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {source.feeds.kpis === 0
                      ? "—"
                      : `${formatNumber(source.feeds.kpis, 0)} KPI${source.feeds.kpis === 1 ? "" : "s"} · ${formatNumber(source.feeds.companies, 0)} co.`}
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-muted-foreground" title={source.steward ?? undefined}>
                    {source.steward ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">{pullAction(source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-border border-t border-border/60 md:hidden">
          {(payload?.sources ?? []).map((source) => (
            <li key={source.code} className="space-y-1.5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{source.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {source.code} · {CADENCE_LABEL[source.cadence] ?? source.cadence} · SLA {slaLabel(source.sla_minutes)}
                  </p>
                </div>
                <StatusBadge tone={source.fresh ? "success" : "warning"}>{source.fresh ? "Fresh" : "Stale"}</StatusBadge>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{source.last_sync_at ? phtDisplayStamp(source.last_sync_at) : "—"}</span>
                {pullAction(source)}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Compact Tabbed Diagnostics Panel */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Diagnostics &amp; Audit History</p>
            <p className="text-xs text-muted-foreground">Coverage gaps, feed latency, and validation run log for {period}.</p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
            {(
              [
                { id: "coverage", label: `Coverage & Gaps (${coverage?.missing ?? 0})` },
                { id: "latency", label: `Feed Latency (${payload?.sources.length ?? 0})` },
                { id: "runs", label: `Check Runs (${payload?.runs.length ?? 0})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDiagTab(t.id)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  diagTab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {diagTab === "coverage" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {tiles.map((tile) => (
                  <Stat key={tile.label} label={tile.label} value={tile.value} note={tile.hint} />
                ))}
              </div>
              {coverage ? (
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <Meter
                    value={coverage.expected > 0 ? (coverage.readings / coverage.expected) * 100 : 0}
                    tone={coverage.missing > 0 ? "warning" : "success"}
                    height={8}
                  />
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
              ) : null}
              {coverage && coverage.missingKpis.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Missing Measure</th>
                        <th className="px-3 py-2 text-left font-medium">Company</th>
                        <th className="px-3 py-2 text-left font-medium">Key</th>
                        <th className="px-3 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {coverage.missingKpis.map((kpi) => (
                        <tr key={`${kpi.companyCode}-${kpi.kpi_key}`}>
                          <td className="px-3 py-2 text-xs font-medium">{kpi.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{kpi.companyCode}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{kpi.kpi_key}</td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => {
                                setPrefillCompany(kpi.companyCode);
                                setDialogOpen(true);
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" /> Add
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No missing measures remaining for {period}.</p>
              )}
            </div>
          ) : null}

          {diagTab === "latency" ? (
            measuredFeeds.length > 0 ? (
              <div className="space-y-3">
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
                  <p className="text-xs text-muted-foreground">
                    Never synced yet: {unmeasuredFeeds.map((s) => s.code).join(", ")}.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No feed has recorded a sync yet. Run a Re-pull above to timestamp the first sync.
              </p>
            )
          ) : null}

          {diagTab === "runs" ? (
            payload && payload.runs.length > 0 ? (
              <ul className="divide-y divide-border/50">
                {payload.runs.map((run) => (
                  <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-xs font-medium">
                        {run.gate ? GATE_LABEL[run.gate] ?? run.gate : run.kind === "VALIDATION" ? "Validation" : run.kind}
                      </span>
                      <span className="ml-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {run.period ?? "—"}
                      </span>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground" title={run.detail ?? undefined}>
                        {run.detail}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {run.run_at ? phtDisplayStamp(run.run_at) : "—"}
                      </span>
                      <StatusBadge tone={GATE_TONE[run.status ?? ""] ?? "neutral"}>
                        {RESULT_LABEL[run.status ?? ""] ?? run.status ?? "Not run"}
                      </StatusBadge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No check runs logged yet for {period}.</p>
            )
          ) : null}
        </div>
      </Panel>

      <ReadingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        data={payload}
        defaultCompanyCode={prefillCompany ?? undefined}
        defaultPeriod={payload?.period ?? period}
        onSaved={() => void data.reload()}
      />
    </div>
  );
}
