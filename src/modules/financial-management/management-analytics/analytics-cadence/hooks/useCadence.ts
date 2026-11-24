"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchCadence } from "../providers/cadenceApi";
import type { CadencePayload } from "../types";

export function useCadence(initial?: string) {
  const [data, setData] = useState<CadencePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (next?: string) => {
    const mine = ++seq.current;
    setIsLoading(true);
    try {
      const payload = await fetchCadence(next);
      if (mine !== seq.current) return;
      setData(payload);
      setError(null);
    } catch (cause) {
      if (mine !== seq.current) return;
      setError(cause instanceof Error ? cause.message : "The pack could not be read.");
    } finally {
      if (mine === seq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(initial);
  }, [load, initial]);

  return { data, isLoading, error, period: data?.period ?? initial ?? "", reload: () => load(initial) };
}
