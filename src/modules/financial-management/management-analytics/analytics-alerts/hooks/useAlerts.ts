"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchAlerts, generateAlerts, saveVariancePolicy, setAlertPolicy, setAlertState } from "../providers/alertsApi";
import type { AlertState, AlertsPayload, Policy } from "../types";

/** The filter a shared link names, so a copied alerts link shows what it says. */
function readUrl(): { state: string; type: string } {
  if (typeof window === "undefined") return { state: "ALL", type: "ALL" };
  const params = new URLSearchParams(window.location.search);
  return { state: params.get("state") ?? "ALL", type: params.get("type") ?? "ALL" };
}

function writeUrl(state: string, type: string) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (state !== "ALL") params.set("state", state);
  if (type !== "ALL") params.set("type", type);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
}

/** Rows per page is a reader preference, so it survives a reload (QA.md 11). */
function readStoredSize(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = Number(window.localStorage.getItem(key));
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function storeSize(key: string, value: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

const SIZE_KEY = "fm.management-analytics.alerts.rows";

export function useAlerts() {
  const initial = useRef(readUrl()).current;
  const [state, setState] = useState(initial.state);
  const [type, setType] = useState(initial.type);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(() => readStoredSize(SIZE_KEY, 10));
  const [data, setData] = useState<AlertsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (nextState: string, nextType: string, nextPage: number, nextSize: number) => {
    const mine = ++seq.current;
    setIsLoading(true);
    try {
      const payload = await fetchAlerts(nextState, nextType, nextPage, nextSize);
      if (mine !== seq.current) return;
      setData(payload);
      setError(null);
    } catch (cause) {
      if (mine !== seq.current) return;
      setError(cause instanceof Error ? cause.message : "The alerts could not be read.");
    } finally {
      if (mine === seq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(state, type, page, size);
  }, [load, state, type, page, size]);

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      setIsBusy(true);
      try {
        const result = await action();
        await load(state, type, page, size);
        return result;
      } finally {
        setIsBusy(false);
      }
    },
    [load, state, type, page, size],
  );

  return {
    data,
    isLoading,
    isBusy,
    error,
    state,
    type,
    page,
    size,
    // A filter that keeps the old page number would land on an empty view.
    setState: useCallback((next: string) => {
      setPage(1);
      writeUrl(next, type);
      setState(next);
    }, [type]),
    setType: useCallback((next: string) => {
      setPage(1);
      writeUrl(state, next);
      setType(next);
    }, [state]),
    setPage,
    setSize: useCallback((next: number) => {
      setPage(1);
      storeSize(SIZE_KEY, next);
      setSize(next);
    }, []),
    reload: () => load(state, type, page, size),
    generate: () => run(generateAlerts),
    mark: (id: number, next: AlertState) => run(() => setAlertState(id, next)),
    togglePolicy: (id: number, isEnabled: boolean) => run(() => setAlertPolicy(id, { isEnabled })),
    applyPolicy: (policy: Policy) => run(() => saveVariancePolicy(policy)),
  };
}
