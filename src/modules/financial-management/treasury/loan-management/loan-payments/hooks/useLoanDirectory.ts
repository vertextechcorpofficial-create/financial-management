"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PAYMENT_PAGE_SIZE } from "../constants";
import { fetchLoanDirectory } from "../providers/paymentsApi";
import type { PaymentLoanRow } from "../types";
import { usePageSize } from "../components/TablePager";

export interface DirectoryFilterState {
  q: string;
  status: string;
  lenderType: string;
  method: string;
}

const EMPTY_FILTERS: DirectoryFilterState = { q: "", status: "ALL", lenderType: "ALL", method: "ALL" };

/** The landing list: which loans match the filters, and what each one still owes. */
export function useLoanDirectory() {
  const [filters, setFilters] = useState<DirectoryFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setStoredPageSize] = usePageSize("loan-payments-directory-size", PAYMENT_PAGE_SIZE);
  const [rows, setRows] = useState<PaymentLoanRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const payload = await fetchLoanDirectory({ ...filters, page, pageSize });
      if (seq !== requestSeq.current) return;
      setRows(payload.rows);
      setTotal(payload.total);
      setError(null);
    } catch (caught) {
      if (seq !== requestSeq.current) return;
      setRows([]);
      setTotal(0);
      setError(caught instanceof Error ? caught.message : "The loans could not be read.");
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateFilters = useCallback((patch: Partial<DirectoryFilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const setPageSize = useCallback(
    (size: number) => {
      setStoredPageSize(size);
      setPage(1);
    },
    [setStoredPageSize],
  );

  return {
    rows,
    total,
    filters,
    page,
    pageSize,
    isLoading,
    error,
    reload: load,
    setPage,
    setPageSize,
    updateFilters,
    clearFilters,
  };
}
