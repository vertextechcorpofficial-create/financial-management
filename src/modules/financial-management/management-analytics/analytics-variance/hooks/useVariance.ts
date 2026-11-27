"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { closeException, fetchBoard, fileMemo, fetchDetail, recordReading, scan, type BoardQuery } from "../providers/varianceApi";
import { DEFAULT_POLICY } from "../services/engine";
import type { ExceptionBoard, ExceptionDetail } from "../types";

export interface VarianceFilters {
  company: string;
  status: string;
  q: string;
}

const EMPTY: ExceptionBoard = {
  asOf: "",
  companies: [],
  counts: {},
  open: 0,
  overdue: 0,
  total: 0,
  page: 1,
  size: 10,
  rows: [],
  policy: DEFAULT_POLICY,
};

/** The filter a shared variance link names, so the register opens on what the link says. */
function readUrl(fallbackSize = 10): { filters: VarianceFilters; page: number; size: number } {
  const fallback = { filters: { company: "ALL", status: "ALL", q: "" }, page: 1, size: fallbackSize };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  return {
    filters: { company: params.get("company") ?? "ALL", status: params.get("status") ?? "ALL", q: params.get("q") ?? "" },
    page: Number.isFinite(page) && page > 0 ? page : 1,
    size: Number.isFinite(size) && size > 0 ? size : fallbackSize,
  };
}

function writeUrl(filters: VarianceFilters, page: number, size: number) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  for (const key of ["company", "status", "q"] as const) {
    const value = filters[key];
    if (value && value !== "ALL") params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  if (size !== 10) params.set("size", String(size));
  const query = params.toString();
  window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
}

/** Rows per page is a reader preference, so it survives a reload (QA.md 11). */
function readStoredSize(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = Number(window.localStorage.getItem(key));
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function storeSize(key: string, value: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

const SIZE_KEY = "fm.management-analytics.variance.rows";

export function useVariance(initialSize = 10) {
  const initial = useRef(readUrl(initialSize)).current;
  const [filters, setFilters] = useState<VarianceFilters>(initial.filters);
  const [page, setPageState] = useState(initial.page);
  const [size, setSizeState] = useState(() => (initial.size > 0 ? initial.size : readStoredSize(SIZE_KEY, 10)));
  const [board, setBoard] = useState<ExceptionBoard>(EMPTY);
  const [isLoading, setLoading] = useState(true);
  const [hasRead, setHasRead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setScanning] = useState(false);
  const [detail, setDetail] = useState<ExceptionDetail | null>(null);
  const [isSaving, setSaving] = useState(false);
  const requestSeq = useRef(0);

  const query: BoardQuery = { ...filters, page, size };

  const load = useCallback(async (next: BoardQuery) => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    try {
      const payload = await fetchBoard(next);
      if (requestSeq.current !== seq) return;
      setBoard(payload);
      setError(null);
      setHasRead(true);
    } catch (caught) {
      if (requestSeq.current !== seq) return;
      setError(caught instanceof Error ? caught.message : "The register could not be read.");
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query);
    // The query is rebuilt from its parts so the effect only runs when one of them moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.company, filters.status, filters.q, page, size]);

  const updateFilters = (patch: Partial<VarianceFilters>) => {
    setFilters((current) => {
      const next = { ...current, ...patch };
      writeUrl(next, 1, size);
      return next;
    });
    setPageState(1);
  };

  const setPage = (next: number) => {
    const value = Math.max(1, next);
    setPageState(value);
    writeUrl(filters, value, size);
  };
  const setSize = (next: number) => {
    storeSize(SIZE_KEY, next);
    setSizeState(next);
    setPageState(1);
    writeUrl(filters, 1, next);
  };

  const reload = () => load({ ...filters, page, size });

  const openDetail = async (id: number) => {
    try {
      setDetail(await fetchDetail(id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That exception could not be read.");
    }
  };

  const runScan = async (period: string) => {
    setScanning(true);
    try {
      const result = await scan(period, filters.company);
      await load({ ...filters, page, size });
      return result;
    } finally {
      setScanning(false);
    }
  };

  const saveMemo = async (id: number, memo: string) => {
    setSaving(true);
    try {
      setDetail(await fileMemo(id, memo));
      await load({ ...filters, page, size });
    } finally {
      setSaving(false);
    }
  };

  const close = async (id: number, note: string) => {
    setSaving(true);
    try {
      setDetail(await closeException(id, note));
      await load({ ...filters, page, size });
    } finally {
      setSaving(false);
    }
  };

  const addReading = async (id: number, period: string, value: number) => {
    setSaving(true);
    try {
      setDetail(await recordReading(id, period, value));
      await load({ ...filters, page, size });
    } finally {
      setSaving(false);
    }
  };

  return {
    board,
    filters,
    page,
    size,
    isLoading,
    isScanning,
    isSaving,
    error,
    hasRead,
    detail,
    setDetail,
    updateFilters,
    setPage,
    setSize,
    reload,
    openDetail,
    runScan,
    saveMemo,
    close,
    addReading,
  };
}
