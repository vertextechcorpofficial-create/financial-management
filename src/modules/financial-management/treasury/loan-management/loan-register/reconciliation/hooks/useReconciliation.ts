"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RECONCILIATION_PAGE_SIZE } from "../constants";
import {
  fetchContext,
  fetchReconciliations,
  fetchRollForward,
  saveRollForward,
  signOffReconciliation,
  type ReconciliationContext,
  type ReconciliationPage,
} from "../providers/reconciliationApi";
import type { ReconciliationRow, RollForward } from "../types";

type State = {
  rows: ReconciliationRow[];
  total: number;
  page: number;
  pageSize: number;
};

const EMPTY: State = { rows: [], total: 0, page: 1, pageSize: RECONCILIATION_PAGE_SIZE };

/** Roll-forward preview, the saved list and the sign-off, in one hook.
 *
 *  `requestSeq` guards the list: a slow page-2 response must not repaint over page 3. */
export function useReconciliation() {
  const [state, setState] = useState<State>(EMPTY);
  const [context, setContext] = useState<ReconciliationContext | null>(null);
  const [period, setPeriod] = useState<{ periodStart: string; periodEnd: string }>({
    periodStart: "",
    periodEnd: "",
  });
  const [rollForward, setRollForward] = useState<RollForward | null>(null);
  const [resultFilter, setResultFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (page: number, pageSize: number, result: string) => {
      const seq = ++requestSeq.current;
      setIsLoading(true);
      setError(null);
      try {
        const data: ReconciliationPage = await fetchReconciliations({ result, page, pageSize });
        if (seq !== requestSeq.current) return;
        setState({ rows: data.rows, total: data.total, page: data.page, pageSize: data.pageSize });
      } catch (caught) {
        if (seq !== requestSeq.current) return;
        setError(caught instanceof Error ? caught.message : "The reconciliations could not be read.");
      } finally {
        if (seq === requestSeq.current) setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await fetchContext();
        setContext(loaded);
        setPeriod(loaded.defaultPeriod);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The loan list could not be read.");
      }
      await load(1, RECONCILIATION_PAGE_SIZE, "ALL");
    })();
  }, [load]);

  const build = useCallback(async () => {
    setIsBuilding(true);
    setError(null);
    setNotice(null);
    try {
      const next = await fetchRollForward(period);
      setRollForward(next);
    } catch (caught) {
      setRollForward(null);
      setError(caught instanceof Error ? caught.message : "The roll-forward could not be built.");
    } finally {
      setIsBuilding(false);
    }
  }, [period]);

  const save = useCallback(
    async (remarks: string) => {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      try {
        const saved = await saveRollForward({ ...period, remarks });
        setNotice(`Roll-forward saved for ${saved.periodStart} to ${saved.periodEnd}.`);
        await load(state.page, state.pageSize, resultFilter);
        return saved;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The roll-forward could not be saved.");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [period, load, state.page, state.pageSize, resultFilter],
  );

  const signOff = useCallback(
    async (id: number, remarks?: string) => {
      setError(null);
      setNotice(null);
      try {
        const signed = await signOffReconciliation(id, remarks);
        setNotice(`Signed off by ${signed.signedByName ?? "you"} on ${signed.signedAt ?? "this period"}.`);
        await load(state.page, state.pageSize, resultFilter);
        return signed;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The period could not be signed off.");
        return null;
      }
    },
    [load, state.page, state.pageSize, resultFilter],
  );

  return {
    ...state,
    context,
    period,
    setPeriod,
    rollForward,
    resultFilter,
    isLoading,
    isBuilding,
    isSaving,
    error,
    notice,
    build,
    save,
    signOff,
    reload: () => load(state.page, state.pageSize, resultFilter),
    setPage: (page: number) => {
      setState((prev) => ({ ...prev, page }));
      void load(page, state.pageSize, resultFilter);
    },
    setPageSize: (pageSize: number) => {
      setState((prev) => ({ ...prev, page: 1, pageSize }));
      void load(1, pageSize, resultFilter);
    },
    setResultFilter: (result: string) => {
      setResultFilter(result);
      setState((prev) => ({ ...prev, page: 1 }));
      void load(1, state.pageSize, result);
    },
    clearNotice: () => setNotice(null),
  };
}
