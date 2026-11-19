"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClosedPeriod, HistoryPage } from "../report-types";
import { getClosedPeriods } from "../providers/bankReconciliationReportsApi";
import { validPeriodMonth } from "../services/reportSelection";

export function useClosedPeriods(periodId: number, enabled: boolean) {
  const [data, setData] = useState<HistoryPage<ClosedPeriod> | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [periodMonth, setPeriodMonth] = useState(""), [validation, setValidation] = useState("");
  const request = useRef<AbortController | null>(null), generation = useRef(0), boundary = useRef<number | undefined>(undefined);
  const target = useRef({ page: 1, month: "", valid: true }), settled = useRef(false);
  const cancel = useCallback(() => { ++generation.current; request.current?.abort(); }, []);
  const load = useCallback(async (page: number, month: string, reset = false) => {
    const token = ++generation.current; request.current?.abort(); const controller = new AbortController(); request.current = controller;
    if (reset) boundary.current = undefined;
    target.current = { page, month, valid: true }; settled.current = false; setData(null); setLoading(true); setError("");
    try {
      const result = await getClosedPeriods(periodId, page, boundary.current, controller.signal, month);
      if (token !== generation.current) return;
      boundary.current = result.throughClosureId; setData(result);
    } catch (e) { if (!controller.signal.aborted && token === generation.current) setError(e instanceof Error ? e.message : "Unable to load report history."); }
    finally { if (token === generation.current) { settled.current = true; setLoading(false); } }
  }, [periodId]);
  useEffect(() => {
    if (!enabled) return;
    if (!settled.current && target.current.valid) void load(target.current.page, target.current.month);
    return cancel;
  }, [enabled, load, cancel]);

  function changeMonth(month: string, badInput = false) {
    setPeriodMonth(month);
    if (badInput || !validPeriodMonth(month)) {
      cancel(); target.current = { page: 1, month, valid: false }; settled.current = false;
      setValidation("Enter a valid period-end month."); setData(null); setLoading(false); setError("");
      return;
    }
    setValidation(""); void load(1, month);
  }

  return { data, loading, error, periodMonth, validation, changeMonth,
    loadPage: (page: number) => void load(page, periodMonth),
    retry: () => void load(target.current.page, target.current.month), refresh: () => void load(1, periodMonth, true),
  };
}
