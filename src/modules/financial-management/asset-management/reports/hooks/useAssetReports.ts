"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { AssetReportsPayload, ReportTabKey } from "../types";
import { fetchAssetReports } from "../providers/fetchProvider";

export function useAssetReports() {
  const [data, setData] = useState<AssetReportsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ReportTabKey>("register");
  const [selectedYear, setSelectedYear] = useState<string>("");

  // Activity log filters
  const [activitySearch, setActivitySearch] = useState("");
  const [activityUser, setActivityUser] = useState("ALL");
  const [activityAction, setActivityAction] = useState("ALL");

  const loadData = useCallback(async (yearParam?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchAssetReports(yearParam || undefined);
      setData(res);
      if (!yearParam && res.year) {
        setSelectedYear(res.year);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load asset reports");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(selectedYear || undefined);
  }, [loadData, selectedYear]);

  const handleYearChange = (newYear: string) => {
    setSelectedYear(newYear);
  };

  const filteredActivityRows = useMemo(() => {
    if (!data?.activityLog.rows) return [];
    const q = activitySearch.trim().toLowerCase();
    return data.activityLog.rows.filter((row) => {
      if (activityUser !== "ALL" && row.userName !== activityUser) return false;
      if (activityAction !== "ALL" && row.actionCode !== activityAction) return false;
      if (!q) return true;
      const inTag = (row.assetTag || "").toLowerCase().includes(q);
      const inDetails = row.details.toLowerCase().includes(q);
      const inUser = row.userName.toLowerCase().includes(q);
      const inAction = row.actionName.toLowerCase().includes(q);
      const inChanges = row.changes.some(
        (c) =>
          c.field.toLowerCase().includes(q) ||
          c.from.toLowerCase().includes(q) ||
          c.to.toLowerCase().includes(q)
      );
      return inTag || inDetails || inUser || inAction || inChanges;
    });
  }, [data, activitySearch, activityUser, activityAction]);

  return {
    data,
    isLoading,
    error,
    activeTab,
    setActiveTab,
    selectedYear: selectedYear || data?.year || String(new Date().getFullYear()),
    handleYearChange,
    activitySearch,
    setActivitySearch,
    activityUser,
    setActivityUser,
    activityAction,
    setActivityAction,
    filteredActivityRows,
    refresh: () => loadData(selectedYear || undefined),
  };
}
