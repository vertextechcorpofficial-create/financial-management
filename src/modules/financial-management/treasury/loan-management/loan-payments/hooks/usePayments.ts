"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PAYMENT_PAGE_SIZE } from "../constants";
import { fetchLoanOptions, fetchPayments } from "../providers/paymentsApi";
import type { LoanOption, PaymentListRow, PaymentsSummary } from "../types";

export interface PaymentFilters {
  q: string;
  method: string;
  status: string;
  loanId: number | null;
}

const EMPTY_SUMMARY: PaymentsSummary = {
  posted: 0,
  amountThisMonth: 0,
  penaltyCharged: 0,
  advanceHeld: 0,
};

export function usePayments() {
  const [filters, setFilters] = useState<PaymentFilters>({ q: "", method: "ALL", status: "ALL", loanId: null });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(PAYMENT_PAGE_SIZE);
  const [rows, setRows] = useState<PaymentListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<PaymentsSummary>(EMPTY_SUMMARY);
  const [loans, setLoans] = useState<LoanOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const payload = await fetchPayments({ ...filters, page, pageSize });
      if (seq !== requestSeq.current) return;
      setRows(payload.rows);
      setTotal(payload.total);
      setSummary(payload.summary);
      setError(null);
    } catch (caught) {
      if (seq !== requestSeq.current) return;
      setRows([]);
      setTotal(0);
      setSummary(EMPTY_SUMMARY);
      setError(caught instanceof Error ? caught.message : "The payments could not be read.");
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadLoans = useCallback(async () => {
    try {
      setLoans(await fetchLoanOptions());
    } catch {
      // The filter simply has no loans to offer; the table still reads.
      setLoans([]);
    }
  }, []);

  useEffect(() => {
    void loadLoans();
  }, [loadLoans]);

  const updateFilters = useCallback((patch: Partial<PaymentFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([load(), loadLoans()]);
  }, [load, loadLoans]);

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
    reload,
    setPage,
    setPageSize,
    updateFilters,
    loadLoans,
  };
}
