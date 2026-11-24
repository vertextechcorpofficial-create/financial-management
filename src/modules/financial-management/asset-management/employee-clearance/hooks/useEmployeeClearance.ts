"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import type { EmployeeClearanceData, EmployeeClearanceRecord } from "../types";
import { fetchEmployeeClearances } from "../providers/fetchProvider";

export function useEmployeeClearance() {
  const [data, setData] = useState<EmployeeClearanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<EmployeeClearanceRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchEmployeeClearances();
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load employee clearance.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEmployees = (data?.employees || []).filter((emp) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      emp.employee_name.toLowerCase().includes(q) ||
      emp.department_name.toLowerCase().includes(q) ||
      emp.status.toLowerCase().includes(q)
    );
  });

  const openEmployee = (record: EmployeeClearanceRecord) => {
    setSelectedRecord(record);
    setIsDetailOpen(true);
  };

  return {
    data,
    filteredEmployees,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    selectedRecord,
    setSelectedRecord,
    isDetailOpen,
    setIsDetailOpen,
    openEmployee,
    refresh: loadData,
  };
}
