"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { portfolioSchema, type LedgerState, type Portfolio } from "../types";
import { ledgerService } from "../services/client";
import type { LedgerPage } from "../navigation";

export function usePropertyLedger(page: LedgerPage = "dashboard") {
  const [state, setState] = useState<LedgerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => { if (!busy.current) setRefreshKey(key => key + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    ledgerService.load(page, controller.signal).then(data => {
      if (!controller.signal.aborted) setState(data);
    }).catch(e => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load ledger");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, refreshKey]);
  async function save(portfolio: Portfolio) {
    if (!state || busy.current || loading) { toast.info("Wait for the current request to finish"); return false; }
    const parsed = portfolioSchema.safeParse(portfolio);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return false; }
    busy.current = true; setSaving(true);
    try {
      const result = await ledgerService.save(state.revision, parsed.data, page);
      setState({ ...state, revision: result.revision, portfolio: parsed.data });
      toast.success("Property Ledger saved");
      // Reload history without discarding the successfully saved local state on read failure.
      try { setState(await ledgerService.load(page)); } catch { toast.warning("Saved. Refresh to load the latest change history."); }
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to save ledger"); return false; }
    finally { busy.current = false; setSaving(false); }
  }
  return { state, loading, saving, error, refresh, save };
}
