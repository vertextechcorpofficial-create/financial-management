"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import type { AssetDashboardData } from "../types";
import { fetchDashboardData } from "../providers/fetchProvider";

export function useAssetDashboard() {
  const [data, setData] = useState<AssetDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchDashboardData();
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load dashboard data.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    data,
    isLoading,
    error,
    refresh: loadData,
  };
}
