"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Brgy, BrgyTransfer } from "../../types";
import { SubTabs } from "../../shared/SubTabs";

const API = "/api/fm/barangay-asset-inventory-system";

const peso = (n: number) => "PHP " + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface LguAsset {
  id: number;
  description: string;
  acquisitionDate: string | null;
  cost: number;
  className: string | null;
  conditionName: string | null;
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(API + path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.message) || "Request failed");
  return body;
}

/**
 * Section 4.9 and 4.10 from the LGU side, duplicated inside this module on purpose:
 * the LGU register is another team's file, so the control lives here and the data comes
 * through the API seam in server/lguFeed.ts.
 */
export function LguConsole({ barangays, setError, setNotice }: { barangays: Brgy[]; setError: (v: string | null) => void; setNotice: (v: string | null) => void }) {
  const [assets, setAssets] = React.useState<LguAsset[]>([]);
  const [returns, setReturns] = React.useState<BrgyTransfer[]>([]);
  const [assetNames, setAssetNames] = React.useState<Record<number, string>>({});
  const [q, setQ] = React.useState("");
  const [toBarangay, setToBarangay] = React.useState<string>(barangays[0] ? String(barangays[0].id) : "");
  const [remark, setRemark] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [feedError, setFeedError] = React.useState<string | null>(null);
  // section 4.9 and 4.10 are two different jobs, so they get one pane each, never one long scroll
  const [pane, setPane] = React.useState<"assets" | "returns">("assets");

  const loadAssets = React.useCallback(async () => {
    setFeedError(null);
    try {
      const data = await call("/lgu/assets?q=" + encodeURIComponent(q));
      setAssets(data.assets ?? []);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : String(err));
    }
  }, [q]);

  const loadReturns = React.useCallback(async () => {
    try {
      const data = await call("/lgu/returns");
      setReturns(data.returns ?? []);
      const map: Record<number, string> = {};
      for (const a of data.assets ?? []) map[Number(a.id)] = String(a.asset_code) + " " + String(a.name);
      setAssetNames(map);
    } catch {
      /* the inbox is empty or unavailable, the assign half still works */
    }
  }, []);

  React.useEffect(() => {
    void loadAssets();
    void loadReturns();
  }, [loadAssets, loadReturns]);

  async function assign(asset: LguAsset) {
    setBusy(true);
    setError(null);
    try {
      const res = await call("/lgu/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lguAssetId: asset.id, toBarangayId: Number(toBarangay), remark }),
      });
      setNotice(
        res.lguRecordUpdated
          ? "Sent to the barangay. The LGU record was marked transferred."
          : "Sent to the barangay. The LGU register still counts it until their side marks the handoff."
      );
      setRemark("");
      await Promise.all([loadAssets(), loadReturns()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function decide(transferId: number, decision: "confirm_return" | "decline_return") {
    setBusy(true);
    setError(null);
    try {
      const reason = decision === "decline_return" ? window.prompt("Why decline this return?") ?? "" : "";
      if (decision === "decline_return" && !reason.trim()) return;
      await call("/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferId, decision, remark: reason }),
      });
      setNotice(decision === "confirm_return" ? "Return confirmed." : "Return declined.");
      await loadReturns();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border p-3 text-sm">
        Assets owned by the municipal office that can be handed to a barangay. Sending one moves it to that barangay&apos;s
        incoming list, where they accept or reject it.
      </div>

      <SubTabs
        value={pane}
        onChange={setPane}
        tabs={[
          { id: "assets", label: "LGU assets", count: assets.length },
          { id: "returns", label: "Incoming returns", count: returns.length },
        ]}
      />

      {pane === "assets" ? (
        <>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-sm" placeholder="Search the LGU register" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={toBarangay} onChange={(e) => setToBarangay(e.target.value)}>
          {barangays.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} {b.name}
            </option>
          ))}
        </select>
        <Input className="max-w-xs" placeholder="Transfer reference or remark" value={remark} onChange={(e) => setRemark(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => void loadAssets()}>Refresh</Button>
      </div>

      {feedError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{feedError}</div> : null}

      <div className="rounded-md border">
        <div className="border-b bg-muted/40 p-2 text-sm font-medium">LGU assets available</div>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b bg-muted/20 text-left">
              <th className="p-2">Description</th>
              <th className="p-2">Class</th>
              <th className="p-2">Condition</th>
              <th className="p-2">Acquired</th>
              <th className="p-2 text-right">Cost</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="p-2">{a.description}</td>
                <td className="p-2">{a.className ?? ""}</td>
                <td className="p-2">{a.conditionName ?? ""}</td>
                <td className="p-2">{a.acquisitionDate ?? ""}</td>
                <td className="p-2 text-right">{peso(a.cost)}</td>
                <td className="p-2 text-right">
                  <Button size="sm" disabled={busy || !toBarangay} onClick={() => void assign(a)}>Assign to barangay</Button>
                </td>
              </tr>
            ))}
            {assets.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-sm text-muted-foreground">
                  {feedError ? "The LGU register could not be read." : "No LGU asset matches."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

        </>
      ) : null}

      {pane === "returns" ? (
      <div className="rounded-md border">
        <div className="border-b bg-muted/40 p-2 text-sm font-medium">Incoming returns from barangays</div>
        <table className="w-full text-sm">
          <tbody>
            {returns.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="p-2">{assetNames[Number(t.asset_id)] ?? "asset " + t.asset_id}</td>
                <td className="p-2">{t.defect ?? t.remark ?? ""}</td>
                <td className="p-2"><Badge variant="outline">{t.status}</Badge></td>
                <td className="p-2 text-right">
                  <span className="flex justify-end gap-1">
                    <Button size="sm" disabled={busy} onClick={() => void decide(t.id, "confirm_return")}>Confirm</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decide(t.id, "decline_return")}>Decline</Button>
                  </span>
                </td>
              </tr>
            ))}
            {returns.length === 0 ? (
              <tr>
                <td className="p-4 text-center text-sm text-muted-foreground">No asset is waiting to return.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      ) : null}
    </div>
  );
}
