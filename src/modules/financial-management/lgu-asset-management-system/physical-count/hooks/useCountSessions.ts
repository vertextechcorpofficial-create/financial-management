"use client";

import * as React from "react";
import type { CountReport, CountSessionDetail, CountSessionInput, CountSessionsResponse } from "../../types";
import {
  createCountSessionRequest,
  fetchCountSessionRequest,
  fetchCountSessions,
  fetchReportRequest,
  markCountLineRequest,
  resolveLineRequest,
  sessionActionRequest,
} from "../providers/fetchProvider";

const EMPTY: CountSessionsResponse = {
  sessions: [],
  lookups: { offices: [], classes: [], conditions: [] },
};

export function useCountSessions() {
  const [data, setData] = React.useState<CountSessionsResponse>(EMPTY);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchCountSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const create = React.useCallback(
    async (input: CountSessionInput) => {
      setBusy(true);
      setError(null);
      try {
        const detail = await createCountSessionRequest(input);
        await load();
        return detail;
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  return { data, loading, error, busy, refresh: load, create };
}

export function useCountSession(id: number | null) {
  const [detail, setDetail] = React.useState<CountSessionDetail | null>(null);
  const [report, setReport] = React.useState<CountReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await fetchCountSessionRequest(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const mark = React.useCallback(
    async (payload: { lineId: number; found: boolean; conditionId?: number | null; locationSeen?: string | null; remarks?: string | null }) => {
      if (!id) return;
      setBusy(true);
      setError(null);
      try {
        setDetail(await markCountLineRequest(id, payload));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [id]
  );

  const resolve = React.useCallback(
    async (payload: {
      lineId: number;
      resolution: "missing" | "moved" | "station";
      toOfficeId?: number | null;
      toOfficer?: string | null;
      locationSeen?: string | null;
      remarks?: string | null;
      stationDescription?: string | null;
      stationLocation?: string | null;
      stationCost?: number | null;
      approvedBy?: string | null;
    }) => {
      if (!id) return;
      setBusy(true);
      setError(null);
      try {
        setDetail(await resolveLineRequest(id, payload));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [id]
  );

  const act = React.useCallback(
    async (action: "lock" | "reopen" | "submit", opts?: { reason?: string; submittedTo?: string }) => {
      if (!id) return;
      setBusy(true);
      setError(null);
      try {
        setDetail(await sessionActionRequest(id, { action, ...opts }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [id]
  );

  const loadReport = React.useCallback(
    async (form: "rpcppe" | "rpcsp") => {
      if (!id) return;
      setBusy(true);
      setError(null);
      try {
        setReport(await fetchReportRequest(id, form));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [id]
  );

  return { detail, report, loading, error, busy, refresh: load, mark, resolve, act, loadReport };
}
