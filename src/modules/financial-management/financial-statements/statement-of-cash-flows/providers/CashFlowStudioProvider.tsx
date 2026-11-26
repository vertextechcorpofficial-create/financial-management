"use client";

import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode, useCallback } from "react";
import {
  CFSFilterState,
  CFSData,
  CFSEntityCode,
  CFSViewBy,
  CFSCompareOption,
  CFSStatementLine,
  CFSSummaryResponse,
} from "../types";
import { CFS_ENTITIES } from "../constants/sample-data";
import { getLiveCashFlowSummary } from "../services/cash-flow-direct.service";
import { transformSummaryToDirectCFSData, createEmptyCFSData } from "../utils/cfs-direct-transformer";

interface CashFlowStudioContextType {
  filters: CFSFilterState;
  data: CFSData;
  isLoading: boolean;
  selectedLineForAudit: CFSStatementLine | null;
  liveSummaryData: CFSSummaryResponse | null;
  setViewBy: (viewBy: CFSViewBy) => void;
  setPeriodDate: (date: string, label: string) => void;
  setCompare: (compare: boolean) => void;
  setCompareOption: (option: CFSCompareOption) => void;
  setEntity: (entity: CFSEntityCode) => void;
  setShowChangeColumns: (show: boolean) => void;
  openAuditTrail: (line: CFSStatementLine) => void;
  closeAuditTrail: () => void;
  refreshData: () => void;
  applyFilters: (newFilters: Partial<CFSFilterState>) => void;
}

const CashFlowStudioContext = createContext<CashFlowStudioContextType | undefined>(undefined);

export function CashFlowStudioProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<CFSFilterState>({
    viewBy: "Annually",
    periodDate: "2026-06-30",
    periodLabel: "FY 2026 H1",
    dateRangeLabel: "Jan 1 – Jun 30, 2026",
    startDate: "2026-01-01",
    endDate: "2026-06-30",
    compare: false,
    compareOption: "previous_year",
    comparePeriodLabel: "Previous year (FY 2025)",
    compareStartDate: "2025-01-01",
    compareEndDate: "2025-06-30",
    entity: "GRP",
    showChangeColumns: true,
    simulateUnmapped: false,
    dataSourceMode: "live",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [selectedLineForAudit, setSelectedLineForAudit] = useState<CFSStatementLine | null>(null);
  const [liveSummaryData, setLiveSummaryData] = useState<CFSSummaryResponse | null>(null);
  const [liveComparisonData, setLiveComparisonData] = useState<CFSSummaryResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("—");

  const currentEntity = useMemo(() => {
    if (liveSummaryData?.companyCode) {
      return {
        code: liveSummaryData.companyCode as CFSEntityCode,
        name: liveSummaryData.companyName || liveSummaryData.companyCode,
        isConsolidated: liveSummaryData.companyCode === "GRP",
      };
    }
    return CFS_ENTITIES.find((e) => e.code === filters.entity) || {
      code: filters.entity,
      name: filters.entity === "GRP" ? "Group (Combined before eliminations)" : filters.entity,
      isConsolidated: filters.entity === "GRP",
    };
  }, [filters.entity, liveSummaryData]);

  // Fetch live summary data from backend
  const fetchLiveData = useCallback(async () => {
    setIsLoading(true);
    try {
      const summary = await getLiveCashFlowSummary({
        startDate: filters.startDate,
        endDate: filters.endDate,
        groupBy: filters.viewBy === "Monthly" ? "month" : "month",
        companyCode: filters.entity,
      });

      setLiveSummaryData(summary);
      setLastUpdated(new Date().toLocaleTimeString("en-PH"));

      if (filters.compare && filters.compareStartDate && filters.compareEndDate) {
        try {
          const compSummary = await getLiveCashFlowSummary({
            startDate: filters.compareStartDate,
            endDate: filters.compareEndDate,
            groupBy: "month",
            companyCode: filters.entity,
          });
          setLiveComparisonData(compSummary);
        } catch {
          setLiveComparisonData(null);
        }
      } else {
        setLiveComparisonData(null);
      }
    } catch {
      // Strictly set to null so the empty zero-state is displayed without mock fallback
      setLiveSummaryData(null);
      setLiveComparisonData(null);
    } finally {
      setIsLoading(false);
    }
  }, [filters.startDate, filters.endDate, filters.viewBy, filters.compare, filters.compareStartDate, filters.compareEndDate, filters.entity]);

  useEffect(() => {
    fetchLiveData();
  }, [fetchLiveData]);

  // Compute Active Data (Strictly live data, or clean zero-state if empty/error)
  const data: CFSData = useMemo(() => {
    if (liveSummaryData && liveSummaryData.success) {
      const live = transformSummaryToDirectCFSData(liveSummaryData, liveComparisonData, currentEntity);
      return { ...live, lastUpdated };
    }
    return { ...createEmptyCFSData(currentEntity, filters.endDate), lastUpdated };
  }, [liveSummaryData, liveComparisonData, currentEntity, filters.endDate, lastUpdated]);

  const setViewBy = (viewBy: CFSViewBy) => {
    let periodLabel = "FY 2026 H1";
    let dateRangeLabel = "Jan 1 – Jun 30, 2026";
    let comparePeriodLabel = "Previous year (FY 2025)";
    let startDate = "2026-01-01";
    let endDate = "2026-06-30";
    let compareStartDate = "2025-01-01";
    let compareEndDate = "2025-06-30";

    if (viewBy === "Monthly") {
      periodLabel = "May 2026";
      dateRangeLabel = "May 1 – May 31, 2026";
      comparePeriodLabel = "Previous month (Apr 2026)";
      startDate = "2026-05-01";
      endDate = "2026-05-31";
      compareStartDate = "2026-04-01";
      compareEndDate = "2026-04-30";
    } else if (viewBy === "Quarterly") {
      periodLabel = "Q1 2026";
      dateRangeLabel = "Jan 1 – Mar 31, 2026";
      comparePeriodLabel = "Previous quarter (Q4 2025)";
      startDate = "2026-01-01";
      endDate = "2026-03-31";
      compareStartDate = "2025-10-01";
      compareEndDate = "2025-12-31";
    }

    setFilters((prev) => ({
      ...prev,
      viewBy,
      periodLabel,
      dateRangeLabel,
      comparePeriodLabel,
      startDate,
      endDate,
      compareStartDate,
      compareEndDate,
    }));
  };

  const setPeriodDate = (periodDate: string, periodLabel: string) => {
    setFilters((prev) => ({ ...prev, periodDate, periodLabel }));
  };

  const setCompare = (compare: boolean) => {
    setFilters((prev) => ({ ...prev, compare }));
  };

  const setCompareOption = (compareOption: CFSCompareOption) => {
    let comparePeriodLabel = "Previous year (FY 2025)";
    if (compareOption === "previous_period") comparePeriodLabel = "Previous period";
    if (compareOption === "custom") comparePeriodLabel = "Custom period";
    setFilters((prev) => ({ ...prev, compareOption, comparePeriodLabel }));
  };

  const setEntity = (entity: CFSEntityCode) => {
    setFilters((prev) => ({ ...prev, entity }));
  };

  const setShowChangeColumns = (showChangeColumns: boolean) => {
    setFilters((prev) => ({ ...prev, showChangeColumns }));
  };

  const openAuditTrail = (line: CFSStatementLine) => {
    setSelectedLineForAudit(line);
  };

  const closeAuditTrail = () => {
    setSelectedLineForAudit(null);
  };

  const refreshData = () => {
    fetchLiveData();
  };

  const applyFilters = (newFilters: Partial<CFSFilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  return (
    <CashFlowStudioContext.Provider
      value={{
        filters,
        data,
        isLoading,
        selectedLineForAudit,
        liveSummaryData,
        setViewBy,
        setPeriodDate,
        setCompare,
        setCompareOption,
        setEntity,
        setShowChangeColumns,
        openAuditTrail,
        closeAuditTrail,
        refreshData,
        applyFilters,
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
