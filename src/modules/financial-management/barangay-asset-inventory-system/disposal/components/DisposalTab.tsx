"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  Brgy,
  BrgyAsset,
  BrgyCondition,
  BrgyCount,
  BrgyDisposal,
  BrgyHistoryEntry,
  BrgySettings,
  BrgyStatus,
  BrgyTransfer,
} from "../../types";
import { call } from "../../shared/ui";

/* -------------------------------------------------------------- disposal */

export function DisposalTab({ barangayId, setError, setNotice }: { barangayId: number; setError: (v: string | null) => void; setNotice: (v: string | null) => void }) {
  const [rows, setRows] = React.useState<{ request: BrgyDisposal; asset: BrgyAsset | null }[]>([]);

  const load = React.useCallback(async () => {
    try {
      const data = await call("/disposals?barangayId=" + barangayId);
      setRows(data.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [barangayId, setError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function act(id: number, body: Record<string, unknown>) {
    try {
      await call("/disposals/" + id + "/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNotice("Disposal updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="p-2">Asset</th>
            <th className="p-2">Reason</th>
            <th className="p-2">Status</th>
            <th className="p-2">Requested by</th>
            <th className="p-2">Approved by</th>
            <th className="p-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ request, asset }) => (
            <tr key={request.id} className="border-b last:border-0">
              <td className="p-2">{asset ? asset.asset_code + " " + asset.name : request.asset_id}</td>
              <td className="p-2">{request.reason}</td>
              <td className="p-2"><Badge variant="outline">{request.status}</Badge></td>
              <td className="p-2">{request.requested_by ?? ""}</td>
              <td className="p-2">{request.approved_by ?? ""}</td>
              <td className="p-2 text-right">
                {request.status === "pending" ? (
                  <span className="flex justify-end gap-1">
                    <Button size="sm" onClick={() => void act(request.id, { action: "approve", remark: window.prompt("Approve remark") ?? "" })}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => void act(request.id, { action: "return", remark: window.prompt("Why return this request?") ?? "" })}>Return</Button>
                  </span>
                ) : request.status === "approved" ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      const method = window.prompt("Method: sold, donated, condemned or destroyed", "condemned") as "sold" | "donated" | "condemned" | "destroyed" | null;
                      if (method) void act(request.id, { action: "complete", method, note: window.prompt("Short note") ?? "" });
                    }}
                  >
                    Mark disposed
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">No disposal request yet. Send an unserviceable asset for disposal from its asset card.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

