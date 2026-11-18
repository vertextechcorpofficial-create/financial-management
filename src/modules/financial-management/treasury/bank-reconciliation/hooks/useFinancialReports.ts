"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReportContext, ReportKey, ReportViewData } from "../report-types";
import { getFinancialReports } from "../providers/bankReconciliationReportsApi";
import { isReportKey } from "../services/reportSelection";

const legacyTabs: Record<string, ReportKey> = {
  "#r-statement": "statement", "#r-aging": "aging", "#r-journal": "journal", "#r-audit": "audit", "#r-closed": "closedPeriods",
};

function tabFromUrl(url: URL): ReportKey {
  const report = url.searchParams.get("report");
  return isReportKey(report) ? report : legacyTabs[url.hash] ?? "statement";
}

function validId(value: string | null) {
  return value !== null && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}

type Selection = { id: number; closureId?: number; report: ReportKey };

export function useFinancialReports(enabled: boolean) {
  const [report, setReport] = useState<ReportKey>("statement");
  const [data, setData] = useState<ReportViewData | null>(null), [context, setContext] = useState<ReportContext | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const selection = useRef<Selection | null>(null), request = useRef<AbortController | null>(null), generation = useRef(0);
  const cancel = useCallback(() => { ++generation.current; request.current?.abort(); selection.current = null; }, []);

  const open = useCallback(async (url: URL, refresh = false) => {
    const active = tabFromUrl(url);
    if (legacyTabs[url.hash] || (url.searchParams.has("report") && !isReportKey(url.searchParams.get("report")))) {
      url.searchParams.set("report", active);
      if (legacyTabs[url.hash]) url.hash = "";
      window.history.replaceState(null, "", url);
    }
    setReport(active);
    const id = url.searchParams.get("periodId"), closure = url.searchParams.get("closureId");
    if (!validId(id) || (closure !== null && !validId(closure))) {
      cancel(); setLoading(false); setData(null); setContext(null);
      setError(id !== null || closure !== null ? "Choose a valid saved period and closure revision." : "");
      return;
    }
    const next = { id: Number(id), closureId: closure === null ? undefined : Number(closure), report: active };
    const previous = selection.current;
    if (!refresh && previous?.id === next.id && previous.closureId === next.closureId && previous.report === next.report) return;

    const token = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller; selection.current = next;
    setData(null); setLoading(true); setError("");
    try {
      const result = await getFinancialReports(next.id, next.closureId, controller.signal, active);
      if (token !== generation.current) return;
      const revision = result.period.lifecycle?.closureId;
      selection.current = { ...next, closureId: revision };
      const resolved = new URL(window.location.href);
      if (revision) resolved.searchParams.set("closureId", String(revision));
      else resolved.searchParams.delete("closureId");
      window.history.replaceState(null, "", resolved);
      setContext({ period: result.period, entity: result.entity });
      setData(result);
    } catch (e) {
      if (token === generation.current && !controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load the report.");
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [cancel]);

  useEffect(() => {
    if (!enabled) return;
    const openUrl = () => { void open(new URL(window.location.href)); };
    openUrl(); window.addEventListener("popstate", openUrl);
    return () => { cancel(); window.removeEventListener("popstate", openUrl); };
  }, [enabled, open, cancel]);

  function selectReport(next: ReportKey) {
    const url = new URL(window.location.href);
    if (tabFromUrl(url) === next) return;
    url.searchParams.set("report", next); url.hash = "";
    window.history.pushState(null, "", url);
    void open(url);
  }
  function selectPeriod(id: number, closureId?: number, target?: ReportKey) {
    const url = new URL(window.location.href);
    url.searchParams.set("periodId", String(id));
    if (closureId) url.searchParams.set("closureId", String(closureId)); else url.searchParams.delete("closureId");
    if (target) url.searchParams.set("report", target);
    url.hash = "";
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
    return open(url, true);
  }

  return { report, data, context, loading, error, selectReport, selectPeriod, refresh: () => void open(new URL(window.location.href), true) };
}
