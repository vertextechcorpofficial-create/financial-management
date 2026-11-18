"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CHANGE_PAGE_SIZE, CHANGE_PAGE_SIZE_STORAGE_KEY } from "../constants";
import { fetchChanges } from "../providers/changesApi";
import type { ChangeKind, ChangeListRow, ChangesSummary, LoanOption } from "../types";
import { usePageSize } from "../components/TablePager";

export interface ChangeFilters {
  q: string;
  kind: ChangeKind | "ALL";
  loanId: number | null;
  from: string | null;
  to: string | null;
}

export const EMPTY_FILTERS: ChangeFilters = { q: "", kind: "ALL", loanId: null, from: null, to: null };

const EMPTY_SUMMARY: ChangesSummary = {
  posted: 0,
  reversed: 0,
  prepaymentsTotal: 0,
  payoffsTotal: 0,
  gainLossTotal: 0,
};

/** The list the screen renders: filters, page, and the rows the route returns for them. */
export function useChanges() {
  const [filters, setFilters] = useState<ChangeFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize(CHANGE_PAGE_SIZE_STORAGE_KEY, CHANGE_PAGE_SIZE);
  const [rows, setRows] = useState<ChangeListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ChangesSummary>(EMPTY_SUMMARY);
  const [loans, setLoans] = useState<LoanOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const payload = await fetchChanges({ ...filters, page, pageSize });
      if (seq !== requestSeq.current) return;
      setRows(payload.rows);
      setTotal(payload.total);
      setSummary(payload.summary ?? EMPTY_SUMMARY);
      setLoans(payload.options?.loans ?? []);
      setError(null);
    } catch (caught) {
      if (seq !== requestSeq.current) return;
      setRows([]);
      setTotal(0);
      setSummary(EMPTY_SUMMARY);
      setError(caught instanceof Error ? caught.message : "The changes could not be read.");
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateFilters = useCallback((patch: Partial<ChangeFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const changePageSize = useCallback(
    (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    [setPageSize],
  );

  return {
    rows,
    total,
    summary,
    loans,
    filters,
    page,
    pageSize,
    isLoading,
    error,
    reload: load,
    setPage,
    setPageSize: changePageSize,
    updateFilters,
    clearFilters,
  };
}
