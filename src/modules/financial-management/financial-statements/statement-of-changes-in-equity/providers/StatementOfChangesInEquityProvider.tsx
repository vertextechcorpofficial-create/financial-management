"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  SCEFilterState,
  SCEStatementResponse,
  SCEViewBy,
  SCEPriorPeriodBasis,
  SCECompareMode,
  SCEJournalLine,
  CellDrillDownDetails,
} from "../types";
import { computeDateRange, stepPeriod } from "../utils/periods";
import { fetchSCEStatement, fetchSCEJournalLines } from "../services/sce.service";

interface SCEContextValue {
  filters: SCEFilterState;
  setViewBy: (viewBy: SCEViewBy) => void;
  setPeriodDate: (dateStr: string) => void;
  stepPrevPeriod: () => void;
  stepNextPeriod: () => void;
  setDivision: (divisionId: string) => void;
  setDepartment: (departmentId: string) => void;
  setBasis: (basis: SCEPriorPeriodBasis) => void;
  setCompare: (enabled: boolean) => void;
  setCompareMode: (mode: SCECompareMode) => void;
  data: SCEStatementResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  // Account Entries Drawer State (from Account Breakdown Tab)
  selectedDrillDownAccount: { glCode: string; title: string } | null;
  drillDownLines: SCEJournalLine[];
  isDrillDownLoading: boolean;
  openDrillDown: (glCode: string, title: string) => void;
  closeDrillDown: () => void;
  // Statement Cell Drill-Down Modal State (from Statement Matrix Table)
  cellDrillDown: CellDrillDownDetails | null;
  openCellDrillDown: (details: CellDrillDownDetails) => void;
  closeCellDrillDown: () => void;
}

const SCEContext = createContext<SCEContextValue | undefined>(undefined);

export function StatementOfChangesInEquityProvider({ children }: { children: React.ReactNode }) {
  const initialDate = "2026-10-31";
  const initialRange = computeDateRange("Monthly", initialDate);

  const [filters, setFilters] = useState<SCEFilterState>({
    viewBy: "Monthly",
    periodDate: initialDate,
    periodLabel: initialRange.label,
    startDate: initialRange.startDate,
    endDate: initialRange.endDate,
    daysCount: initialRange.daysCount,
    compare: false,
    compareMode: "previous_period",
    divisionId: "all",
    departmentId: "all",
    basis: "restated",
  });

  const [data, setData] = useState<SCEStatementResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Drilldown state
  const [selectedDrillDownAccount, setSelectedDrillDownAccount] = useState<{
    glCode: string;
    title: string;
  } | null>(null);
  const [drillDownLines, setDrillDownLines] = useState<SCEJournalLine[]>([]);
  const [isDrillDownLoading, setIsDrillDownLoading] = useState<boolean>(false);

  // Statement Cell Drill-down state
  const [cellDrillDown, setCellDrillDown] = useState<CellDrillDownDetails | null>(null);

  // Guard to abort outdated in-flight requests and prevent race conditions
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchSCEStatement(filters);
      if (!controller.signal.aborted) {
        setData(response);
      }
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Failed to load SCE data");
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const setViewBy = (viewBy: SCEViewBy) => {
    const range = computeDateRange(viewBy, filters.periodDate);
    setFilters((prev) => ({
      ...prev,
      viewBy,
      periodLabel: range.label,
      startDate: range.startDate,
      endDate: range.endDate,
      daysCount: range.daysCount,
    }));
  };

  const setPeriodDate = (periodDate: string) => {
    const range = computeDateRange(filters.viewBy, periodDate);
    setFilters((prev) => ({
      ...prev,
      periodDate,
      periodLabel: range.label,
      startDate: range.startDate,
      endDate: range.endDate,
      daysCount: range.daysCount,
    }));
  };

  const stepPrevPeriod = () => {
    const nextDate = stepPeriod(filters.viewBy, filters.periodDate, "prev");
    setPeriodDate(nextDate);
  };

  const stepNextPeriod = () => {
    const nextDate = stepPeriod(filters.viewBy, filters.periodDate, "next");
    setPeriodDate(nextDate);
  };

  const setDivision = (divisionId: string) => {
    setFilters((prev) => ({ ...prev, divisionId }));
  };

  const setDepartment = (departmentId: string) => {
    setFilters((prev) => ({ ...prev, departmentId }));
  };

  const setBasis = (basis: SCEPriorPeriodBasis) => {
    setFilters((prev) => ({ ...prev, basis }));
  };

  const setCompare = (compare: boolean) => {
    setFilters((prev) => ({ ...prev, compare }));
  };

  const setCompareMode = (compareMode: SCECompareMode) => {
    setFilters((prev) => ({ ...prev, compareMode }));
  };

  const openDrillDown = async (glCode: string, title: string) => {
    setSelectedDrillDownAccount({ glCode, title });
    setIsDrillDownLoading(true);
    try {
      const lines = await fetchSCEJournalLines(glCode, filters.startDate, filters.endDate);
      setDrillDownLines(lines);
    } catch (err) {
      console.error(err);
      setDrillDownLines([]);
    } finally {
      setIsDrillDownLoading(false);
    }
  };

  const closeDrillDown = () => {
    setSelectedDrillDownAccount(null);
    setDrillDownLines([]);
  };

  const openCellDrillDown = (details: CellDrillDownDetails) => {
    setCellDrillDown(details);
  };

  const closeCellDrillDown = () => {
    setCellDrillDown(null);
  };

  const value = useMemo(
    () => ({
      filters,
      setViewBy,
      setPeriodDate,
      stepPrevPeriod,
      stepNextPeriod,
      setDivision,
      setDepartment,
      setBasis,
      setCompare,
      setCompareMode,
      data,
      isLoading,
      error,
      refresh: loadData,
      selectedDrillDownAccount,
      drillDownLines,
      isDrillDownLoading,
      openDrillDown,
      closeDrillDown,
      cellDrillDown,
      openCellDrillDown,
      closeCellDrillDown,
    }),
    [
      filters,
      data,
      isLoading,
      error,
      selectedDrillDownAccount,
      drillDownLines,
      isDrillDownLoading,
      cellDrillDown,
      loadData,
      openDrillDown,
      closeDrillDown,
      openCellDrillDown,
      closeCellDrillDown,
      setPeriodDate,
      setViewBy,
      stepNextPeriod,
      stepPrevPeriod,
    ]
  );

  return <SCEContext.Provider value={value}>{children}</SCEContext.Provider>;
}

export function useStatementOfChangesInEquity() {
  const context = useContext(SCEContext);
  if (!context) {
    throw new Error("useStatementOfChangesInEquity must be used within a StatementOfChangesInEquityProvider");
  }
  return context;
}
