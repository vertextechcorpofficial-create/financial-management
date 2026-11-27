"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { BrgyTransfer } from "../../types";
import { call, type Lookups } from "../../shared/ui";
import { SubTabs } from "../../shared/SubTabs";
import { Pager } from "../../shared/Pager";

/* ------------------------------------------------------------- transfers */

/**
 * Two lists that can each grow: what the LGU sent and is waiting, and what this barangay sent back.
 * They get one pane each and a pager, so a long incoming queue never buries the outgoing list at
 * the bottom of the screen.
 */
export function TransfersTab({
  barangayId,
  lookups,
  canAssign,
  setError,
  setNotice,
}: {
  barangayId: number;
  lookups: Lookups;
  /** every role may watch the queue, receiving or rejecting needs the assign right */
  canAssign: boolean;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const [data, setData] = React.useState<{ incoming: BrgyTransfer[]; outgoing: BrgyTransfer[] }>({ incoming: [], outgoing: [] });
  const [pane, setPane] = React.useState<"incoming" | "outgoing">("incoming");
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 25;

  const load = React.useCallback(async () => {
    try {
      setData(await call("/transfers?barangayId=" + barangayId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [barangayId, setError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [pane]);

  async function act(body: Record<string, unknown>) {
    try {
      await call("/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNotice("Transfer updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const rows = pane === "incoming" ? data.incoming : data.outgoing;
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="grid gap-3">
      <SubTabs
        value={pane}
        onChange={setPane}
        tabs={[
          { id: "incoming", label: "Incoming, waiting for this barangay", count: data.incoming.length },
          { id: "outgoing", label: "Outgoing from this barangay", count: data.outgoing.length },
        ]}
      />

      <div className="rounded-md border">
        {pane === "incoming" ? (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b bg-muted/20 text-left">
                <th className="p-2">Asset</th>
                <th className="p-2">Status</th>
                <th className="p-2">Direction</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="p-2 font-mono text-xs">asset {t.asset_id}</td>
                  <td className="p-2">{t.status}</td>
                  <td className="p-2">{t.direction}</td>
                  <td className="p-2 text-right">
                    {t.status === "for_receiving" && canAssign ? (
                      <span className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => void act({ transferId: t.id, decision: "receive" })}>
                          Receive
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void act({ transferId: t.id, decision: "reject", remark: window.prompt("Why reject?") ?? "" })}>
                          Reject
                        </Button>
                      </span>
                    ) : t.status === "for_receiving" ? (
                      <span className="text-xs text-muted-foreground">Read only for your role</span>
                    ) : t.status === "for_return" ? (
                      <span className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => void act({ transferId: t.id, decision: "confirm_return" })}>
                          Confirm return
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void act({ transferId: t.id, decision: "decline_return", remark: window.prompt("Why decline?") ?? "" })}>
                          Decline
                        </Button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {data.incoming.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-sm text-muted-foreground">
                    Nothing waiting.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b bg-muted/20 text-left">
                <th className="p-2">Asset</th>
                <th className="p-2">Direction</th>
                <th className="p-2">Status</th>
                <th className="p-2">Defect or remark</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="p-2 font-mono text-xs">asset {t.asset_id}</td>
                  <td className="p-2">{t.direction}</td>
                  <td className="p-2">{t.status}</td>
                  <td className="p-2">{t.defect ?? t.remark ?? ""}</td>
                </tr>
              ))}
              {data.outgoing.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-sm text-muted-foreground">
                    No outgoing transfer.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      <Pager page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} noun="transfer" />

      <p className="text-xs text-muted-foreground">
        LGU staff send assets to this barangay from the LGU module. A barangay can only send back an LGU asset with a reported defect. {lookups.barangays.length} barangay record(s) available.
      </p>
    </div>
  );
}
