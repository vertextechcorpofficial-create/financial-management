"use client";

import * as React from "react";
import type {
  AssetHistory,
  CustodyResponse,
  CustodyReturnInput,
  CustodyTransferInput,
} from "../../types";
import {
  fetchAssetHistory,
  fetchCustody,
  issueAssetRequest,
  returnAssetRequest,
  transferAssetRequest,
} from "../providers/fetchProvider";

const EMPTY: CustodyResponse = { rows: [], total: 0, page: 1, pageSize: 50, officers: [], offices: [], prefixes: [] };

export function useAssetCustody(initial?: { q?: string; officeId?: number | null; onlyWithOfficer?: boolean }) {
  const [params, setParams] = React.useState({
    q: "",
    officeId: null as number | null,
    onlyWithOfficer: false,
    page: 1,
    sort: "property_no",
    dir: "asc",
    form: null as string | null,
    officer: null as string | null,
    prefix: null as string | null,
    ...initial,
  });
  const [data, setData] = React.useState<CustodyResponse>(EMPTY);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [history, setHistory] = React.useState<AssetHistory | null>(null);

  const load = React.useCallback(async (next: typeof params) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchCustody(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(params);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [load, params]);

  const patchParams = React.useCallback((patch: Partial<typeof params>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  }, []);

  const openHistory = React.useCallback(async (assetId: number) => {
    setError(null);
    try {
      setHistory(await fetchAssetHistory(assetId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const closeHistory = React.useCallback(() => setHistory(null), []);

  const run = React.useCallback(
    async (fn: () => Promise<AssetHistory>) => {
      setBusy(true);
      setError(null);
      try {
        const result = await fn();
        setHistory(result);
        await load(params);
        return result;
      } finally {
        setBusy(false);
      }
    },
    [load, params]
  );

  const issue = React.useCallback((input: CustodyTransferInput) => run(() => issueAssetRequest(input)), [run]);
  const transfer = React.useCallback((input: CustodyTransferInput) => run(() => transferAssetRequest(input)), [run]);
  const giveBack = React.useCallback((input: CustodyReturnInput) => run(() => returnAssetRequest(input)), [run]);

  return {
    params,
    patchParams,
    data,
    loading,
    error,
    busy,
    history,
    openHistory,
    closeHistory,
    issue,
    transfer,
    giveBack,
    refresh: () => load(params),
  };
}
