"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthorityContext } from "../types";
import type { WorkspaceCommand } from "../domain/workspace";
import { authorityApi, AuthorityApiError } from "../services/authorityApi";

export function useAuthorityWorkspace() {
  const [context, setContext] = useState<AuthorityContext | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const pending = useRef<{ key: string; body: unknown } | null>(null);
  const refresh = useCallback(async () => {
    const next = await authorityApi<AuthorityContext>("context");
    setContext(next); setError(""); return next;
  }, []);
  useEffect(() => {
    let cancelled = false;
    authorityApi<AuthorityContext>("context").then(next => { if (!cancelled) { setContext(next); setError(""); } })
      .catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const command = async (value: WorkspaceCommand) => {
    if (!context || busy) return;
    setBusy(true); setError("");
    // Retry the exact same body/request ID after an ambiguous timeout, never duplicate a write.
    const key = JSON.stringify({ value, revision: context.revision });
    if (pending.current?.key !== key) pending.current = { key, body: { expectedRevision: context.revision, requestId: crypto.randomUUID(), command: value } };
    try {
      await authorityApi("commands", pending.current.body);
      pending.current = null;
      await refresh().catch(() => { setError("Save confirmed, but refresh failed. Refresh before making another change."); });
    } catch (e) {
      if (e instanceof AuthorityApiError && e.status < 500) pending.current = null;
      throw e;
    } finally { setBusy(false); }
  };
  return { context, loading, busy, error, refresh, command };
}
