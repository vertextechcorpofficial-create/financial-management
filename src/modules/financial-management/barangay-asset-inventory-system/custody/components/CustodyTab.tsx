"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { BrgyAsset, BrgySettings } from "../../types";
import {   projectedTotal } from "../../types";
import { call,  peso, today, type Lookups } from "../../shared/ui";

/* --------------------------------------------------------------- custody */

export function CustodyTab(props: {
  barangayId: number;
  lookups: Lookups;
  settings: BrgySettings | null;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const { barangayId, lookups, settings, setError } = props;
  const [rows, setRows] = React.useState<BrgyAsset[]>([]);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const data = await call("/assets?barangayId=" + barangayId + "&pageSize=100");
      setRows(data.assets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [barangayId, setError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const groups = React.useMemo(() => {
    const map = new Map<string, BrgyAsset[]>();
    for (const row of rows) {
      const name = lookups.custodians.find((c) => c.id === row.custodian_id)?.full_name ?? "Unassigned";
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(row);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, lookups.custodians]);

  async function reassign(assetId: number) {
    const name = window.prompt("Custodian name or id? Enter the custodian id from the list.");
    if (!name) return;
    setBusy(true);
    try {
      await call("/assets/" + assetId + "/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", custodianId: Number(name) }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const salvage = settings?.salvage_percent ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        Property accountability by custodian. Reassign from the asset card so the previous assignment is closed properly.
      </div>
      {groups.map(([custodian, items]) => (
        <div key={custodian} className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-muted/40 p-2 text-sm">
            <span className="font-medium">{custodian}</span>
            <span className="text-muted-foreground">
              {items.length} asset(s) | total {peso(items.reduce((s, a) => s + projectedTotal(a, today(), salvage), 0))}
            </span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="p-2 font-mono text-xs">{a.asset_code}</td>
                  <td className="p-2">{a.name}</td>
                  <td className="p-2">{a.status}</td>
                  <td className="p-2 text-right">{peso(projectedTotal(a, today(), salvage))}</td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reassign(a.id)}>Reassign</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

