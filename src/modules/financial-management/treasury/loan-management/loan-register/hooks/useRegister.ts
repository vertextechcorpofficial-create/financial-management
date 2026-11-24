"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LOAN_PAGE_SIZE } from "../constants";
import { fetchRegister, type RegisterPayload } from "../providers/registerApi";

export interface RegisterFilters {
  q: string;
  status: string;
  lenderType: string;
}

const EMPTY: RegisterPayload = {
  rows: [],
  total: 0,
  summary: {
    totals: {
      loans: 0,
      current: 0,
      pendingReview: 0,
      outstandingPrincipal: 0,
      dueThisMonth: 0,
      overdueAmount: 0,
      weightedRate: null,
    },
    accounts: [],
    notices: [],
    staleOverdue: 0,
  },
};

export function useRegister() {
  const [filters, setFilters] = useState<RegisterFilters>({ q: "", status: "ALL", lenderType: "ALL" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(LOAN_PAGE_SIZE);
  const [data, setData] = useState<RegisterPayload>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A late response for an older filter must not repaint the table.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const payload = await fetchRegister({ ...filters, page, pageSize });
      if (seq !== requestSeq.current) return;
      setData(payload);
      setError(null);
    } catch (cause) {
      if (seq !== requestSeq.current) return;
      setError(cause instanceof Error ? cause.message : "The loan register could not be read.");
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateFilters = useCallback((next: Partial<RegisterFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  return {
    rows: data.rows,
    total: data.total,
    summary: data.summary,
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
