"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import type { AssetSummaryData } from "../types";
import { fetchAssetSummary } from "../providers/fetchProvider";

export function useAssetSummary(initialGroupBy: string = "item_name") {
  const [data, setData] = useState<AssetSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState(initialGroupBy);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchAssetSummary(groupBy);
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load asset summary.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [groupBy]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter groups based on search query
  const filteredGroups = (data?.groups || []).filter((g) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.itemName.toLowerCase().includes(q) ||
      g.itemType.toLowerCase().includes(q) ||
      g.classification.toLowerCase().includes(q) ||
      g.byDepartmentText.toLowerCase().includes(q) ||
      g.byConditionText.toLowerCase().includes(q) ||
      g.units.some(
        (u) =>
          u.asset_tag?.toLowerCase().includes(q) ||
          u.rfid_code?.toLowerCase().includes(q) ||
          u.serial?.toLowerCase().includes(q)
      )
    );
  });

  return {
    data,
    filteredGroups,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    groupBy,
    setGroupBy,
    refresh: loadData,
  };
}
