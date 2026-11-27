"use client";

import * as React from "react";
import type { DisposalInput, DisposalResponse } from "../../types";
import { disposalAction, fetchDisposals } from "../providers/fetchProvider";

const EMPTY: DisposalResponse = { candidates: [], total: 0, page: 1, pageSize: 50, offices: [], conditions: [] };

export function useDisposal() {
  const [params, setParams] = React.useState({ page: 1, q: "" });
  const [data, setData] = React.useState<DisposalResponse>(EMPTY);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async (next: { page: number; q: string }) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDisposals(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(params), 300);
    return () => window.clearTimeout(timer);
  }, [load, params]);

  const patchParams = React.useCallback((patch: Partial<{ page: number; q: string }>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  }, []);

  const run = React.useCallback(
    async (action: "iirup" | "dispose", input: DisposalInput) => {
      setBusy(true);
      setError(null);
      try {
        const result = await disposalAction(action, input);
        setData(result);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  return { params, patchParams, data, loading, error, busy, run, refresh: () => load(params) };
}
