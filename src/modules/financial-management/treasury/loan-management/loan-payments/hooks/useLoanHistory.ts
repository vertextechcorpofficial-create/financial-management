"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchLoanHistory } from "../providers/paymentsApi";
import type { LoanHistoryRow } from "../types";

export interface HistoryFilterState {
  accountId: number | null;
  from: string;
  to: string;
}

const EMPTY_FILTERS: HistoryFilterState = { accountId: null, from: "", to: "" };

/** One loan's posted payments, narrowed by the account paid from and a date range. */
export function useLoanHistory(loanId: number | null) {
  const [filters, setFilters] = useState<HistoryFilterState>(EMPTY_FILTERS);
  const [rows, setRows] = useState<LoanHistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(loanId));
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    if (!loanId) {
      setRows([]);
      setIsLoading(false);
      return;
    }
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const payload = await fetchLoanHistory(loanId, filters);
      if (seq !== requestSeq.current) return;
      setRows(payload);
      setError(null);
    } catch (caught) {
      if (seq !== requestSeq.current) return;
      setRows([]);
      setError(caught instanceof Error ? caught.message : "The payment history could not be read.");
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [loanId, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateFilters = useCallback((patch: Partial<HistoryFilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  return { rows, filters, isLoading, error, reload: load, updateFilters, clearFilters };
}
