"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { BrgyAsset, BrgyCount } from "../../types";
import { call, peso } from "../../shared/ui";

/* --------------------------------------------------------------- reports */

interface ReportRow {
  asset: BrgyAsset;
  office: string;
  custodian: string;
  projected: number;
  total: number;
}

type ReportPayload =
  | { kind: "masterlist"; asOf: string; rows: ReportRow[]; totalValue: number }
  | { kind: "accountability"; asOf: string; groups: { custodian: string; rows: ReportRow[]; total: number }[] }
  | { kind: "consolidation"; asOf: string; rows: { barangay: string; code: string; assets: number; cost: number; totalValue: number }[]; totals: { assets: number; cost: number; totalValue: number } }
  | { kind: "count"; year: number; status: string; found: number; notFound: number; notYetRecorded: number; conditionChanges: { assetCode: string; name: string; condition: string }[] };

const REPORT_LABELS: Record<string, string> = {
  masterlist: "Asset masterlist",
  accountability: "Property accountability",
  consolidation: "Municipal consolidation",
  count: "Count summary",
};

export function ReportsTab({ barangayId, setError }: { barangayId: number; setError: (v: string | null) => void }) {
  const [kind, setKind] = React.useState<keyof typeof REPORT_LABELS>("masterlist");
  const [payload, setPayload] = React.useState<ReportPayload | null>(null);
  const [counts, setCounts] = React.useState<BrgyCount[]>([]);
  const [countId, setCountId] = React.useState<string>("");

  React.useEffect(() => {
    void (async () => {
      try {
        const data = await call("/counts?barangayId=" + barangayId);
        const list: BrgyCount[] = data.counts ?? [];
        setCounts(list);
        if (list.length && !countId) setCountId(String(list[0].id));
      } catch {
        /* the count picker is optional for three of the four reports */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barangayId]);

  React.useEffect(() => {
    if (kind === "count" && !countId) return;
    void (async () => {
      try {
        const query = "/reports?kind=" + kind + "&barangayId=" + barangayId + (kind === "count" ? "&countId=" + countId : "");
        const data = await call(query);
        setPayload({ kind, ...data } as ReportPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [kind, countId, barangayId, setError]);

  const exportHref =
    "/api/fm/barangay-asset-inventory-system/reports/export?kind=" +
    kind +
    (kind === "consolidation" ? "" : "&barangayId=" + barangayId) +
    (kind === "count" && countId ? "&countId=" + countId : "");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(REPORT_LABELS) as (keyof typeof REPORT_LABELS)[]).map((k) => (
          <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
            {REPORT_LABELS[k]}
          </Button>
        ))}
        {kind === "count" ? (
          <select className="cursor-pointer h-9 rounded-md border bg-background px-3 text-sm" value={countId} onChange={(e) => setCountId(e.target.value)}>
            {counts.length === 0 ? <option value="">No count yet</option> : null}
            {counts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.year} {c.status}
              </option>
            ))}
          </select>
        ) : null}
        <div className="ml-auto">
          <a href={exportHref}>
            <Button size="sm" variant="outline" disabled={kind === "count" && !countId}>
              Excel
            </Button>
          </a>
        </div>
      </div>

      {!payload ? (
        <p className="text-sm text-muted-foreground">Loading report...</p>
      ) : payload.kind === "masterlist" ? (
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-muted/40 p-2 text-sm">
            <span className="font-medium">Asset masterlist</span>
            <span className="text-muted-foreground">
              {payload.rows.length} assets | total {peso(payload.totalValue)} | as of {payload.asOf}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20 text-left">
                <th className="p-2">Asset ID</th>
                <th className="p-2">Description</th>
                <th className="p-2">Office</th>
                <th className="p-2">Custodian</th>
                <th className="p-2">Condition</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Projected</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {payload.rows.map((row) => (
                <tr key={row.asset.id} className="border-b last:border-0">
                  <td className="p-2 font-mono text-xs">{row.asset.asset_code}</td>
                  <td className="p-2">{row.asset.name}</td>
                  <td className="p-2">{row.office}</td>
                  <td className="p-2">{row.custodian || "Unassigned"}</td>
                  <td className="p-2">{row.asset.condition}</td>
                  <td className="p-2 text-right">{row.asset.quantity}</td>
                  <td className="p-2 text-right">{peso(row.projected)}</td>
                  <td className="p-2 text-right">{peso(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : payload.kind === "accountability" ? (
        <div className="flex flex-col gap-2">
          {payload.groups.map((group) => (
            <div key={group.custodian} className="rounded-md border">
              <div className="flex items-center justify-between border-b bg-muted/40 p-2 text-sm">
                <span className="font-medium">{group.custodian}</span>
                <span className="text-muted-foreground">
                  {group.rows.length} asset(s) | {peso(group.total)}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.asset.id} className="border-b last:border-0">
                      <td className="p-2 font-mono text-xs">{row.asset.asset_code}</td>
                      <td className="p-2">{row.asset.name}</td>
                      <td className="p-2">{row.office}</td>
                      <td className="p-2">{row.asset.condition}</td>
                      <td className="p-2 text-right">{peso(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {payload.groups.length === 0 ? <p className="text-sm text-muted-foreground">No active asset yet.</p> : null}
        </div>
      ) : payload.kind === "consolidation" ? (
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-muted/40 p-2 text-sm">
            <span className="font-medium">Municipal consolidation</span>
            <span className="text-muted-foreground">
              {payload.totals.assets} assets | {peso(payload.totals.totalValue)} | as of {payload.asOf}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20 text-left">
                <th className="p-2">Code</th>
                <th className="p-2">Barangay</th>
                <th className="p-2 text-right">Assets</th>
                <th className="p-2 text-right">Cost</th>
                <th className="p-2 text-right">Projected total</th>
              </tr>
            </thead>
            <tbody>
              {payload.rows.map((row) => (
                <tr key={row.code} className="border-b last:border-0">
                  <td className="p-2 font-mono text-xs">{row.code}</td>
                  <td className="p-2">{row.barangay}</td>
                  <td className="p-2 text-right">{row.assets}</td>
                  <td className="p-2 text-right">{peso(row.cost)}</td>
                  <td className="p-2 text-right">{peso(row.totalValue)}</td>
                </tr>
              ))}
              <tr className="bg-muted/20 font-medium">
                <td className="p-2" />
                <td className="p-2">Total</td>
                <td className="p-2 text-right">{payload.totals.assets}</td>
                <td className="p-2 text-right">{peso(payload.totals.cost)}</td>
                <td className="p-2 text-right">{peso(payload.totals.totalValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-4">
            <SummaryTile label="Found" value={String(payload.found)} />
            <SummaryTile label="Not found" value={String(payload.notFound)} />
            <SummaryTile label="Not yet recorded" value={String(payload.notYetRecorded)} />
            <SummaryTile label="Count" value={payload.year + " " + payload.status} />
          </div>
          <div className="rounded-md border">
            <div className="border-b bg-muted/40 p-2 text-sm font-medium">Condition recorded during the count</div>
            <table className="w-full text-sm">
              <tbody>
                {payload.conditionChanges.map((row, index) => (
                  <tr key={row.assetCode + index} className="border-b last:border-0">
                    <td className="p-2 font-mono text-xs">{row.assetCode}</td>
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">{row.condition}</td>
                  </tr>
                ))}
                {payload.conditionChanges.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-sm text-muted-foreground">No condition was recorded during this count.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}


