"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkLedgerCommandStatus, listPendingLedgerCommands, subscribePendingLedgerCommands } from "./ledger-api";

export function PendingCommands({ actor }: { actor: number }) {
  const [pending, setPending] = useState<{ commandId: string; operation: string }[]>([]);
  const [loading, setLoading] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const refresh = () => {
      try { setPending(listPendingLedgerCommands(actor)); setStorageError(false); }
      catch { setStorageError(true); }
    };
    refresh();
    return subscribePendingLedgerCommands(refresh);
  }, [actor]);
  if (!pending.length && !message && !storageError) return null;
  const labels: Record<string, string> = { period: "Period update", reconciliation: "Reconciliation", trade: "Investment transaction", donation: "Donation", master: "Reference data update", "annual-review": "Annual review" };
  return <Card><CardHeader><CardTitle>Request status</CardTitle></CardHeader><CardContent className="space-y-3">
    {storageError && <p role="alert">Browser session storage is unavailable. Posting stays disabled until requests can be tracked safely.</p>}
    {pending.length > 0 && <p className="text-sm">These requests do not yet have a confirmed outcome. Check their status before creating any replacement entry. To retry, submit the exact same form values.</p>}
    {pending.map(command => <div key={command.commandId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
       <div><div className="font-medium">{labels[command.operation] ?? "Financial request"} <Badge variant="outline" className="ml-2 border-amber-200 bg-amber-50 text-amber-700">Awaiting confirmation</Badge></div><code className="break-all text-xs text-muted-foreground">Reference: {command.commandId}</code></div>
      <Button type="button" variant="outline" disabled={Boolean(loading)} onClick={async () => {
        setLoading(command.commandId); setMessage(undefined);
        try {
          const result = await checkLedgerCommandStatus(command.commandId);
          setMessage(result.state === "completed" ? `Committed${result.number != null ? ` as JE-${result.number}` : " successfully"}. Refresh the workspace to see the saved records.` :
            result.state === "failed" ? result.message ?? "The command was rejected; no financial posting was committed by this command." :
              result.message ?? "The outcome is still unknown. Keep this command ID and do not create a replacement entry.");
        } catch { setMessage("Status could not be confirmed. Keep this command ID and check again later."); }
        finally { setLoading(undefined); }
      }}>{loading === command.commandId ? "Checking..." : "Check status"}</Button>
    </div>)}
    {message && <div className="space-y-2"><p role="status" className="text-sm">{message}</p>
      <Button type="button" variant="ghost" onClick={() => setMessage(undefined)}>Dismiss</Button></div>}
  </CardContent></Card>;
}
