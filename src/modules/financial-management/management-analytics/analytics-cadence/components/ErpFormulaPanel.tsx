"use client";

import { useEffect, useState } from "react";

import { Callout, ErpTags, MicroLabel } from "./BoardKit";
import { ERP_INPUT_LABELS, ERP_LIVE_KEYS } from "./analytics-screens";

interface ErpReading {
  kpiKey: string;
  period: string;
  value: number | null;
  basis?: string;
  sourceCode?: string;
  inputs?: Record<string, unknown> | null;
}

const PESO_KEYS = new Set([
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

function formatInputValue(key: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") {
    if (PESO_KEYS.has(key)) {
      return `₱${val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (key.toLowerCase().includes("percent") || key.toLowerCase().includes("rate")) {
      return `${val.toFixed(2)}%`;
    }
    return Number.isInteger(val)
      ? val.toLocaleString("en-PH")
      : val.toLocaleString("en-PH", { maximumFractionDigits: 2 });
  }
  return String(val);
}

/**
 * Live "How it was worked out" inspector for ERP-sourced readings (`ERP_SERVER` `/api/management-analytics/kpi-readings`).
 * Calls `/api/fm/management-analytics/erp-readings` only when the KPI is wired on ERP_SERVER.
 */
export function ErpFormulaPanel({
  kpiKey,
  period,
  sourceCodes,
}: {
  kpiKey: string;
  period: string;
  sourceCodes?: string | null;
}) {
  const supported = ERP_LIVE_KEYS.has(kpiKey) || (sourceCodes ?? "").toUpperCase().includes("ERP");
  const requestKey = `${kpiKey}|${period}`;
  const [state, setState] = useState<{
    key: string;
    status: "ready" | "error";
    reading: ErpReading | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!supported || !period) return;
    let cancelled = false;

    fetch(`/api/fm/management-analytics/erp-readings?period=${encodeURIComponent(period)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
          data?: { readings?: ErpReading[] };
        } | null;
        if (cancelled) return;
        if (!res.ok || !body?.success) {
          setState({
            key: requestKey,
            status: "error",
            reading: null,
            error: body?.error || `Live ERP inputs unavailable (${res.status}).`,
          });
          return;
        }
        const match = (body.data?.readings ?? []).find((r) => r.kpiKey === kpiKey) ?? null;
        setState({ key: requestKey, status: "ready", reading: match, error: null });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            key: requestKey,
            status: "error",
            reading: null,
            error: "Could not reach ERP_SERVER for live inputs.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [kpiKey, period, requestKey, supported]);

  if (!supported) return null;

  if (!state || state.key !== requestKey) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        Loading live ERP formula inputs for {period}…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <Callout tone="warning" title="Live ERP inputs unavailable">
        {state.error}
      </Callout>
    );
  }

  if (!state.reading) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        No live ERP breakdown was returned for <span className="font-mono">{kpiKey}</span> in {period}.
      </div>
    );
  }

  const inputs = state.reading.inputs ?? {};
  const formulaText = typeof inputs.formula === "string" ? inputs.formula : null;
  const entries = Object.entries(inputs).filter(([key]) => key !== "formula");

  return (
    <div className="space-y-2.5 rounded-xl border border-border/70 bg-muted/15 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MicroLabel>How it was worked out · ERP ({period})</MicroLabel>
        <ErpTags kpiKey={kpiKey} sourceCodes="ERP" basis={state.reading.basis} />
      </div>

      {formulaText ? (
        <Callout tone="primary" title="Working formula (assumed until confirmed)">
          {formulaText}
        </Callout>
      ) : null}

      {entries.length > 0 ? (
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {entries.map(([key, val]) => (
            <div key={key} className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1 text-xs">
              <dt className="truncate text-muted-foreground" title={ERP_INPUT_LABELS[key] ?? key}>
                {ERP_INPUT_LABELS[key] ?? key}
              </dt>
              <dd className="shrink-0 font-mono font-medium tabular-nums">
                {formatInputValue(key, val)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">No input breakdown fields returned.</p>
      )}
    </div>
  );
}
