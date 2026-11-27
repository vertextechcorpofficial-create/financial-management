"use client";

import { Panel, PanelHead, SampleBadge } from "./BoardKit";
import { useErpEndpoint } from "./useErpEndpoint";
import { StatusBadge } from "./StatusBadge";

interface UnitsPayload {
  sample?: boolean;
  sites?: string[];
  units?: Array<{ unitCode: string; name: string; site: string; activeHeadcount?: number; active?: boolean }>;
}

interface PositionsPayload {
  sample?: boolean;
  positions?: Array<{
    positionCode: string;
    title: string;
    department?: string;
    isVacant?: boolean;
    incumbent?: { fullName?: string; userId?: string } | null;
    effectiveRecipient?: { fullName?: string; isFallback?: boolean } | null;
  }>;
}

export function ErpOrgRosterPanel() {
  const units = useErpEndpoint<UnitsPayload>("org/units");
  const positions = useErpEndpoint<PositionsPayload>("org/positions");

  if (!units.loading && !positions.loading && !units.available && !positions.available) {
    return null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHead
          title="Organisational Units & Sites (ERP)"
          description="Units used for Diagnostic breakdowns and RA 10173 Workforce aggregation."
          count={units.data?.units?.length}
          right={units.sample ? <SampleBadge /> : null}
        />
        <div className="overflow-x-auto px-4 py-2">
          {units.loading ? (
            <p className="py-4 text-xs text-muted-foreground">Loading ERP units…</p>
          ) : !units.available || !units.data?.units?.length ? (
            <p className="py-4 text-xs text-muted-foreground">Units endpoint not available on this server yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3">Site</th>
                  <th className="py-2 text-right">Headcount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {units.data.units.map((u) => (
                  <tr key={u.unitCode}>
                    <td className="py-2 pr-3 font-medium">{u.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{u.site}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{u.activeHeadcount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHead
          title="Accountable HR Positions & GM Fallback"
          description="Remediation owners resolve by position; vacant roles escalate to General Manager."
          count={positions.data?.positions?.length}
          right={positions.sample ? <SampleBadge /> : null}
        />
        <div className="overflow-x-auto px-4 py-2">
          {positions.loading ? (
            <p className="py-4 text-xs text-muted-foreground">Loading HR positions…</p>
          ) : !positions.available || !positions.data?.positions?.length ? (
            <p className="py-4 text-xs text-muted-foreground">Positions endpoint not available on this server yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Position</th>
                  <th className="py-2 pr-3">Current Holder</th>
                  <th className="py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {positions.data.positions.map((p) => (
                  <tr key={p.positionCode}>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{p.title}</span>
                      {p.department ? <span className="block text-[11px] text-muted-foreground">{p.department}</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {p.isVacant
                        ? `Fallback → ${p.effectiveRecipient?.fullName ?? "General Manager"}`
                        : p.incumbent?.fullName ?? "Assigned"}
                    </td>
                    <td className="py-2 text-right">
                      <StatusBadge tone={p.isVacant ? "warning" : "success"}>{p.isVacant ? "Vacant" : "Filled"}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  );
}
