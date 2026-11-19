"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SCHEDULE_PAGE_SIZE } from "../constants";
import { phtToday } from "../pht";
import { fetchSchedules } from "../providers/schedulesApi";
import type { SchedulePayload } from "../types";
import { emptyBuckets } from "../services/aging";

const EMPTY: SchedulePayload = {
  loans: [],
  loan: null,
  versions: [],
  rows: [],
  total: 0,
  totals: {
    interest: 0,
    principal: 0,
    payment: 0,
    paidPrincipal: 0,
    paidInterest: 0,
    paidPenalty: 0,
    paid: 0,
  },
  tie: null,
  currentPortion: null,
  agingRows: [],
  aging: emptyBuckets(),
  asOf: "",
};

export interface ScheduleFilters {
  loanId: number | null;
  version: number | null;
  status: string;
  asOf: string;
}

/**
 * Loads the schedule screen. The as-of date only moves when the desk says so, so a page left open
 * overnight keeps the buckets it started with instead of shifting under the reader.
 */
export function useSchedules() {
  const [filters, setFilters] = useState<ScheduleFilters>({
    loanId: null,
    version: null,
    status: "ALL",
    asOf: phtToday(),
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(SCHEDULE_PAGE_SIZE);
  const [data, setData] = useState<SchedulePayload>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A late answer for an older filter must not repaint the table.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const payload = await fetchSchedules({ ...filters, page, pageSize });
      if (seq !== requestSeq.current) return;
      setData(payload);
      setError(null);
    } catch (cause) {
      if (seq !== requestSeq.current) return;
      setError(cause instanceof Error ? cause.message : "The schedule could not be read.");
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateFilters = useCallback((next: Partial<ScheduleFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const versions = useMemo(() => {
    if (data.versions.length > 0) return data.versions;
    return data.loan ? [data.loan.scheduleVersion] : [];
  }, [data.loan, data.versions]);

  return {
    data,
    versions,
    filters,
    page,
    pageSize,
    isLoading,
    error,
    reload: load,
    setPage,
    setPageSize,
    updateFilters,
  };
}
