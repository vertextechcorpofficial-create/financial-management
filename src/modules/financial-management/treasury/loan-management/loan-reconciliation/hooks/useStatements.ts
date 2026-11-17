"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { STATEMENT_PAGE_SIZE } from "../constants";
import { fetchStatements, recordStatement, type StatementPage } from "../providers/reconciliationApi";
import type { StatementRow, StatementVariance } from "../types";

type State = {
  rows: StatementRow[];
  total: number;
  page: number;
  pageSize: number;
};

const EMPTY: State = { rows: [], total: 0, page: 1, pageSize: STATEMENT_PAGE_SIZE };

/** The lender-statement list and the record action. Same request-sequencing guard as the list. */
export function useStatements() {
  const [state, setState] = useState<State>(EMPTY);
  const [resultFilter, setResultFilter] = useState("ALL");
  const [loanFilter, setLoanFilter] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastVariances, setLastVariances] = useState<StatementVariance[]>([]);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (page: number, pageSize: number, result: string, loanId: number | null) => {
      const seq = ++requestSeq.current;
      setIsLoading(true);
      setError(null);
      try {
        const data: StatementPage = await fetchStatements({ result, loanId, page, pageSize });
        if (seq !== requestSeq.current) return;
        setState({ rows: data.rows, total: data.total, page: data.page, pageSize: data.pageSize });
      } catch (caught) {
        if (seq !== requestSeq.current) return;
        setError(caught instanceof Error ? caught.message : "The statements could not be read.");
      } finally {
        if (seq === requestSeq.current) setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(1, STATEMENT_PAGE_SIZE, "ALL", null);
  }, [load]);

  const record = useCallback(
    async (input: {
      loanId: number;
      statementDate: string;
      lenderPrincipal: number;
      lenderInterest: number;
      lenderPenalties: number;
      lenderAdvances: number;
      remarks?: string;
    }) => {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      try {
        const recorded = await recordStatement(input);
        setLastVariances(recorded.variances);
        setNotice(recorded.sentence);
        await load(1, state.pageSize, resultFilter, loanFilter);
        return recorded;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The statement could not be recorded.");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [load, state.pageSize, resultFilter, loanFilter],
  );

  return {
    ...state,
    resultFilter,
    loanFilter,
    isLoading,
    isSaving,
    error,
    notice,
    lastVariances,
    record,
    reload: () => load(state.page, state.pageSize, resultFilter, loanFilter),
    setPage: (page: number) => {
      setState((prev) => ({ ...prev, page }));
      void load(page, state.pageSize, resultFilter, loanFilter);
    },
    setPageSize: (pageSize: number) => {
      setState((prev) => ({ ...prev, page: 1, pageSize }));
      void load(1, pageSize, resultFilter, loanFilter);
    },
    setResultFilter: (result: string) => {
      setResultFilter(result);
      setState((prev) => ({ ...prev, page: 1 }));
      void load(1, state.pageSize, result, loanFilter);
    },
    setLoanFilter: (loanId: number | null) => {
      setLoanFilter(loanId);
      setState((prev) => ({ ...prev, page: 1 }));
      void load(1, state.pageSize, resultFilter, loanId);
    },
    clearNotice: () => setNotice(null),
  };
}
