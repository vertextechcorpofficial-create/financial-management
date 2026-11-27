"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchData, postReading, refreshSource, runChecks, type ReadingInput } from "../providers/dataApi";
import type { DataPayload } from "../types";

export function useData(initialPeriod?: string) {
  const [data, setData] = useState<DataPayload | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (next?: string) => {
      const seq = requestSeq.current + 1;
      requestSeq.current = seq;
      setLoading(true);
      try {
        const payload = await fetchData(next ?? initialPeriod);
        if (requestSeq.current !== seq) return payload;
        setData(payload);
        setError(null);
        return payload;
      } catch (cause) {
        if (requestSeq.current === seq) setError(cause instanceof Error ? cause.message : "The data desk could not be read.");
        return null;
      } finally {
        if (requestSeq.current === seq) setLoading(false);
      }
    },
    [initialPeriod],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveReading = useCallback(
    async (input: ReadingInput) => {
      setSaving(true);
      try {
        const result = await postReading(input);
        await load(input.period);
        return result;
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  const checks = useCallback(async () => {
    if (!data) throw new Error("Load the month first.");
    setSaving(true);
    try {
      const result = await runChecks(data.period);
      await load(data.period);
      return result;
    } finally {
      setSaving(false);
    }
  }, [data, load]);

  const pullSource = useCallback(
    async (code: string) => {
      setSaving(true);
      try {
        const result = await refreshSource(code, data?.period || initialPeriod);
        await load(data?.period || initialPeriod);
        return result;
      } finally {
        setSaving(false);
      }
    },
    [data?.period, initialPeriod, load],
  );

  return {
    period: data?.period ?? initialPeriod ?? "",
    data,
    isLoading,
    isSaving,
    error,
    reload: () => load(),
    saveReading,
    checks,
    pullSource,
  };
}
