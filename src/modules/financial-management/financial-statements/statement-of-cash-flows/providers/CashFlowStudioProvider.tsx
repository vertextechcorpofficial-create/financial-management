"use client";

import React, { createContext, useContext, useState, useMemo, ReactNode } from "react";
import {
  CFSFilterState,
  CFSData,
  CFSEntityCode,
  CFSViewBy,
  CFSCompareOption,
  CFSStatementLine,
} from "../types";
import { getSampleCFSData } from "../constants/sample-data";

interface CashFlowStudioContextType {
  filters: CFSFilterState;
  data: CFSData;
  isLoading: boolean;
  selectedLineForAudit: CFSStatementLine | null;
  setViewBy: (viewBy: CFSViewBy) => void;
  setPeriodDate: (date: string, label: string) => void;
  setCompare: (compare: boolean) => void;
  setCompareOption: (option: CFSCompareOption) => void;
  setEntity: (entity: CFSEntityCode) => void;
  setShowChangeColumns: (show: boolean) => void;
  setSimulateUnmapped: (simulate: boolean) => void;
  openAuditTrail: (line: CFSStatementLine) => void;
  closeAuditTrail: () => void;
  refreshData: () => void;
}

const CashFlowStudioContext = createContext<CashFlowStudioContextType | undefined>(undefined);

export function CashFlowStudioProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<CFSFilterState>({
    viewBy: "Annually",
    periodDate: "2026-10-31",
    periodLabel: "FY 2026 YTD",
    dateRangeLabel: "Jan 1 – Oct 31, 2026 304 days · to date",
    startDate: "2026-01-01",
    endDate: "2026-10-31",
    compare: false, // Default is OFF; toggled ON reveals comparison columns
    compareOption: "previous_year",
    comparePeriodLabel: "Previous year (FY 2025 YTD)",
    entity: "GRP",
    showChangeColumns: true,
    simulateUnmapped: false,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [selectedLineForAudit, setSelectedLineForAudit] = useState<CFSStatementLine | null>(null);

  // Dynamic dataset computation based on entity and simulation toggle
  const data = useMemo(() => {
    return getSampleCFSData(filters.entity, filters.simulateUnmapped);
  }, [filters.entity, filters.simulateUnmapped]);

  const setViewBy = (viewBy: CFSViewBy) => {
    let periodLabel = "FY 2026 YTD";
    let dateRangeLabel = "Jan 1 – Oct 31, 2026 304 days · to date";
    let comparePeriodLabel = "Previous year (FY 2025 YTD)";

    if (viewBy === "Monthly") {
      periodLabel = "Sep 2026";
      dateRangeLabel = "Sep 1 – Sep 30, 2026 30 days";
      comparePeriodLabel = "Previous period (Aug 2026)";
    } else if (viewBy === "Quarterly") {
      periodLabel = "Q3 2026";
      dateRangeLabel = "Jul 1 – Sep 30, 2026 92 days";
      comparePeriodLabel = "Previous year (Q3 2025)";
    }

    setFilters((prev) => ({
      ...prev,
      viewBy,
      periodLabel,
      dateRangeLabel,
      comparePeriodLabel,
    }));
  };

  const setPeriodDate = (periodDate: string, periodLabel: string) => {
    setFilters((prev) => ({ ...prev, periodDate, periodLabel }));
  };

  const setCompare = (compare: boolean) => {
    setFilters((prev) => ({ ...prev, compare }));
  };

  const setCompareOption = (compareOption: CFSCompareOption) => {
    let comparePeriodLabel = "Previous year (FY 2025 YTD)";
    if (compareOption === "previous_period") comparePeriodLabel = "Previous period (FY 2025)";
    if (compareOption === "custom") comparePeriodLabel = "Custom period";
    setFilters((prev) => ({ ...prev, compareOption, comparePeriodLabel }));
  };

  const setEntity = (entity: CFSEntityCode) => {
    setFilters((prev) => ({ ...prev, entity }));
  };

  const setShowChangeColumns = (showChangeColumns: boolean) => {
    setFilters((prev) => ({ ...prev, showChangeColumns }));
  };

  const setSimulateUnmapped = (simulateUnmapped: boolean) => {
    setFilters((prev) => ({ ...prev, simulateUnmapped }));
  };

  const openAuditTrail = (line: CFSStatementLine) => {
    setSelectedLineForAudit(line);
  };

  const closeAuditTrail = () => {
    setSelectedLineForAudit(null);
  };

  const refreshData = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 400);
  };

  return (
    <CashFlowStudioContext.Provider
      value={{
        filters,
        data,
        isLoading,
        selectedLineForAudit,
        setViewBy,
        setPeriodDate,
        setCompare,
        setCompareOption,
        setEntity,
        setShowChangeColumns,
        setSimulateUnmapped,
        openAuditTrail,
        closeAuditTrail,
        refreshData,
      }}
    >
      {children}
    </CashFlowStudioContext.Provider>
  );
}

export function useCashFlowStudio() {
  const context = useContext(CashFlowStudioContext);
  if (!context) {
    throw new Error("useCashFlowStudio must be used within a CashFlowStudioProvider");
  }
  return context;
}
