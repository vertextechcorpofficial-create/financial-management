"use client";

import { useMemo, useState } from "react";
import { Download, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber } from "../services/engine";
import { useData } from "../hooks/useData";
import { Notice } from "./Notice";
import { ReadingDialog } from "./ReadingDialog";
import { StatusBadge } from "./StatusBadge";
import { exportUrl } from "../providers/dataApi";
import { phtDisplayShort } from "../pht";

const CADENCE_LABEL: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
};

const STATE_TONE: Record<string, "success" | "warning" | "neutral"> = {
  CONNECTED: "success",
  MANUAL: "warning",
  OFFLINE: "neutral",
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

export function DataModule() {
  const data = useData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefillCompany, setPrefillCompany] = useState<string | undefined>();

  const payload = data.data;
  const coverage = payload?.coverage;

  const tiles = useMemo(
    () => [
      {
        label: "Readings this month",
        value: coverage ? `${formatNumber(coverage.readings, 0)} / ${formatNumber(coverage.expected, 0)}` : "—",
        hint: coverage && coverage.expected > 0 ? `${formatNumber((coverage.readings / coverage.expected) * 100, 0)}% of the catalog` : "Nothing to read",
      },
      {
        label: "Missing",
        value: coverage ? formatNumber(coverage.missing, 0) : "—",
        hint: "Measures with no reading for the month",
      },
      {
        label: "Provisional",
        value: coverage ? formatNumber(coverage.provisional, 0) : "—",
        hint: "Readings still open to revision",
      },
      {
        label: "Duplicates",
        value: coverage ? formatNumber(coverage.duplicates, 0) : "—",
        hint: "Extra rows for the same measure and month",
      },
    ],
    [coverage],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Data Life Cycle</h1>
          <p className="text-xs text-muted-foreground">
            Where every figure comes from, whether it arrived, and what the checks said about it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={data.period || undefined} onValueChange={(value) => void data.changePeriod(value)}>
            <SelectTrigger className="h-9 w-full sm:w-[150px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
              {(payload?.periods ?? []).map((period) => (
                <SelectItem key={period} value={period}>
                  {period}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      </div>

      {data.error ? (
        <Notice tone="danger" title="The data desk could not be read">
          {data.error}
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border/60 bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{tile.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tile.hint}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Sources</p>
            <p className="text-xs text-muted-foreground">Cadence, steward and how long ago each feed last answered.</p>
          </div>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
            {payload ? formatNumber(payload.sources.length, 0) : "—"} {payload?.sources.length === 1 ? "feed" : "feeds"}
          </span>
        </header>
        <div className="hidden overflow-x-auto min-[1300px]:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Source</th>
                <th className="px-4 py-2.5 text-left font-medium">Cadence</th>
                <th className="px-4 py-2.5 text-left font-medium">Steward</th>
                <th className="px-4 py-2.5 text-left font-medium">State</th>
                <th className="px-4 py-2.5 text-right font-medium">Freshness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {!payload && data.isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`loading-${index}`}>
                      <td colSpan={5} className="px-4 py-3">
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
                  <td className="max-w-[220px] truncate px-4 py-2.5 text-muted-foreground" title={source.steward ?? undefined}>
                    {source.steward}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={STATE_TONE[source.state] ?? "neutral"}>{source.state}</StatusBadge>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {source.last_sync_at ? (
                      <span title={source.last_sync_at}>{source.fresh ? "Fresh" : "Stale"}</span>
                    ) : (
                      /* Nothing has recorded a sync for this feed since the module started, so there is no date to print. */
                      <span className="text-muted-foreground">No sync recorded</span>
                    )}
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
                  <p className="truncate text-sm font-medium" title={source.name}>{source.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {source.code} · {CADENCE_LABEL[source.cadence] ?? source.cadence}
                  </p>
                </div>
                <StatusBadge tone={STATE_TONE[source.state] ?? "neutral"}>{source.state}</StatusBadge>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate" title={source.steward ?? undefined}>
                  {source.steward}
                </span>
                <span className="tabular-nums" title={source.last_sync_at ?? undefined}>
                  {source.last_sync_at ? (source.fresh ? "Fresh" : "Stale") : "No sync recorded"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Checks for {payload?.period ?? "the month"}</p>
            <p className="text-xs text-muted-foreground">
              Two checks need the ERP mapped to measures, so they report as not run instead of pretending to pass.
            </p>
          </div>
        </header>
        <ul className="divide-y divide-border/50">
          {(payload?.gates ?? []).map((gate) => (
            <li key={gate.gate} className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{gate.gate.replace(/_/g, " ").toLowerCase()}</p>
                <p className="text-xs text-muted-foreground">{gate.detail}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatNumber(gate.rowsOk, 0)} ok · {formatNumber(gate.rowsFailed, 0)} failed
                </span>
                <StatusBadge tone={GATE_TONE[gate.status] ?? "neutral"}>{RESULT_LABEL[gate.status] ?? gate.status}</StatusBadge>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {coverage && coverage.missingKpis.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <header className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Still missing</p>
            <p className="text-xs text-muted-foreground">Measures with no reading for this month. Recording one closes the gap.</p>
          </header>
          <ul className="divide-y divide-border/50">
            {coverage.missingKpis.map((kpi) => (
              <li key={`${kpi.companyCode}-${kpi.kpi_key}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{kpi.name}</span>
                  <span className="ml-2 text-[11px] uppercase text-muted-foreground">{kpi.companyCode}</span>
                  <p className="truncate mt-0.5 text-xs text-muted-foreground" title={kpi.kpi_key}>{kpi.kpi_key}</p>
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
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium">Recent runs</p>
          <p className="text-xs text-muted-foreground">Every check run is kept, so a month can be shown as it was judged.</p>
        </header>
        {payload && payload.runs.length > 0 ? (
          <ul className="divide-y divide-border/50">
            {payload.runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{run.gate ? GATE_LABEL[run.gate] ?? run.gate : run.kind === "VALIDATION" ? "Validation" : run.kind}</span>
                  <span className="ml-2 text-[11px] tabular-nums text-muted-foreground">{run.period ?? "—"}</span>
                  <p className="truncate mt-0.5 text-xs text-muted-foreground" title={run.detail ?? undefined}>
                    {run.detail}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] tabular-nums text-muted-foreground" title={run.run_at ?? undefined}>
                        {run.run_at ? phtDisplayShort(run.run_at) : "—"}
                      </span>
                  <StatusBadge tone={GATE_TONE[run.status ?? ""] ?? "neutral"}>{RESULT_LABEL[run.status ?? ""] ?? run.status ?? "—"}</StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">No checks have run yet for this month.</p>
        )}
      </section>

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
