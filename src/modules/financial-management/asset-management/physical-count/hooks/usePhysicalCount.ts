"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import type { PhysicalCountOverviewData, StartCountSessionPayload, CountSession } from "../types";
import {
  fetchPhysicalCountOverview,
  createCountSession,
} from "../providers/fetchProvider";

export function usePhysicalCount() {
  const [data, setData] = useState<PhysicalCountOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchPhysicalCountOverview();
      setData(res);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to load physical count overview.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const startSession = async (
    payload: StartCountSessionPayload
  ): Promise<CountSession> => {
    const session = await createCountSession(payload);
    await loadOverview();
    return session;
  };

  return {
    data,
    isLoading,
    error,
    refresh: loadOverview,
    startSession,
  };
}
