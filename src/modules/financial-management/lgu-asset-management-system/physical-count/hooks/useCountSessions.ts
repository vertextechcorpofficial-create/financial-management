"use client";

import * as React from "react";
import type { CountSessionDetail, CountSessionInput, CountSessionsResponse } from "../../types";
import {
  createCountSessionRequest,
  fetchCountSessionRequest,
  fetchCountSessions,
  markCountLineRequest,
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

  return { detail, loading, error, busy, refresh: load, mark };
}
