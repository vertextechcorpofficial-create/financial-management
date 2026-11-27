"use client";

import { CheckCircle2, XCircle } from "lucide-react";

import { Panel, PanelHead, SampleBadge } from "./BoardKit";
import { useErpEndpoint } from "./useErpEndpoint";
import { StatusBadge } from "./StatusBadge";

interface ReconciliationPayload {
  sample?: boolean;
  checkedAt?: string;
  completeness?: { passed: boolean; unmappedFieldCount?: number };
  glReconciliation?: Array<{ checkKey: string; label: string; variancePct: number; passed: boolean }>;
  intercompanyBalances?: Array<{ counterpartyCode: string; ourRecordedAmount: number }>;
  deduplication?: { passed: boolean; duplicatesRemovedCount?: number; note?: string };
  referentialIntegrity?: { passed: boolean; orphanRecordCount?: number };
}

interface SourcesHealthPayload {
  sample?: boolean;
  checkedAt?: string;
  streams?: Array<{
    streamKey: string;
    name: string;
    stewardPosition?: string;
    lastRecordAt?: string;
    status: string;
    pendingCount?: number;
    note?: string;
  }>;
}

export function ErpDataHealthPanel({ period }: { period: string }) {
  const recon = useErpEndpoint<ReconciliationPayload>("reconciliation", { period });
  const health = useErpEndpoint<SourcesHealthPayload>("sources/health");

  if (!recon.loading && !health.loading && !recon.available && !health.available) {
    return null;
  }

  const gates = recon.data
    ? [
        {
          key: "COMPLETENESS",
          label: "Completeness",
          passed: Boolean(recon.data.completeness?.passed),
          detail: `${recon.data.completeness?.unmappedFieldCount ?? 0} unmapped critical fields`,
        },
        {
          key: "RECONCILIATION",
          label: "GL Reconciliation",
          passed: (recon.data.glReconciliation ?? []).every((g) => g.passed),
          detail: `${recon.data.glReconciliation?.length ?? 0} subledger-to-GL ties checked`,
        },
        {
          key: "INTERCOMPANY",
          label: "Intercompany Matching",
          passed: true,
          detail: `${recon.data.intercompanyBalances?.length ?? 0} counterparty balances reported`,
        },
        {
          key: "DEDUPLICATION",
          label: "Deduplication",
          passed: Boolean(recon.data.deduplication?.passed),
          detail: recon.data.deduplication?.note || `${recon.data.deduplication?.duplicatesRemovedCount ?? 0} duplicates removed`,
        },
        {
          key: "REFERENTIAL_INTEGRITY",
          label: "Referential Integrity",
          passed: Boolean(recon.data.referentialIntegrity?.passed),
          detail: `${recon.data.referentialIntegrity?.orphanRecordCount ?? 0} orphan unit/site records`,
        },
      ]
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHead
          title="ERP Pipeline Validation Gates"
          description={`5-gate QA verification from ERP_SERVER for ${period}.`}
          right={recon.sample ? <SampleBadge /> : null}
        />
        <div className="divide-y divide-border/50 px-4">
          {recon.loading ? (
            <p className="py-5 text-xs text-muted-foreground">Loading ERP validation gates…</p>
          ) : !recon.available || gates.length === 0 ? (
            <p className="py-5 text-xs text-muted-foreground">ERP reconciliation endpoint not available yet.</p>
          ) : (
            gates.map((g) => (
              <div key={g.key} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {g.passed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{g.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{g.detail}</p>
                  </div>
                </div>
                <StatusBadge tone={g.passed ? "success" : "danger"}>{g.passed ? "Pass" : "Fail"}</StatusBadge>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHead
          title="ERP Upstream Stream Freshness"
          description="Live table activity and unposted pending queue per source."
          right={health.sample ? <SampleBadge /> : null}
        />
        <div className="divide-y divide-border/50 px-4">
          {health.loading ? (
            <p className="py-5 text-xs text-muted-foreground">Checking ERP stream freshness…</p>
          ) : !health.available || !health.data?.streams?.length ? (
            <p className="py-5 text-xs text-muted-foreground">ERP source health endpoint not available yet.</p>
          ) : (
            health.data.streams.map((s) => (
              <div key={s.streamKey} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {s.note || s.stewardPosition || s.streamKey}
                    {s.pendingCount ? ` · ${s.pendingCount} pending` : ""}
                  </p>
                </div>
                <StatusBadge tone={s.status === "OK" ? "success" : "warning"}>
                  {s.status === "OK" ? "Fresh" : s.status}
                </StatusBadge>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
