"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchCatalog, type CatalogQuery } from "../providers/catalogApi";
import type { CatalogPayload } from "../types";

/** The filters a shared link carries; anything missing falls back to the whole catalogue. */
function readUrl(): { filters: CatalogFilters; page: number; size: number } {
  const fallback = { filters: { tier: "ALL", company: "ALL", domain: "ALL", q: "" }, page: 1, size: 20 };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  return {
    filters: {
      tier: params.get("tier") ?? "ALL",
      company: params.get("company") ?? "ALL",
      domain: params.get("domain") ?? "ALL",
      q: params.get("q") ?? "",
    },
    page: Number.isFinite(page) && page > 0 ? page : 1,
    size: Number.isFinite(size) && size > 0 ? size : 20,
  };
}

/** Keep the address bar on the same view the table shows, so a copied link reopens it. */
function writeUrl(filters: CatalogFilters, page: number, size: number) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  for (const key of ["tier", "company", "domain", "q"] as const) {
    const value = filters[key];
    if (value && value !== "ALL") params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  if (size !== 20) params.set("size", String(size));
  const query = params.toString();
  window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
}

export interface CatalogFilters {
  tier: string;
  company: string;
  domain: string;
  q: string;
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

const SIZE_KEY = "fm.management-analytics.tiers.rows";

export function useCatalog() {
  const initial = useRef(readUrl()).current;
  const [filters, setFilters] = useState<CatalogFilters>(initial.filters);
  const [page, setPageState] = useState(initial.page);
  const [size, setSizeState] = useState(() => (initial.size > 0 ? initial.size : readStoredSize(SIZE_KEY, 20)));
  const [data, setData] = useState<CatalogPayload | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const sizeRef = useRef(initial.size);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const query = useMemo<CatalogQuery>(
    () => ({ ...filters, page, size }),
    [filters, page, size],
  );

  const load = useCallback(async () => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    try {
      const payload = await fetchCatalog(query);
      if (requestSeq.current !== seq) return;
      setData(payload);
      setError(null);
    } catch (cause) {
      if (requestSeq.current !== seq) return;
      setError(cause instanceof Error ? cause.message : "The catalogue could not be read.");
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateFilters = useCallback((patch: Partial<CatalogFilters>) => {
    setFilters((current) => {
      const next = { ...current, ...patch };
      writeUrl(next, 1, sizeRef.current);
      return next;
    });
    setPageState(1);
  }, []);

  return {
    rows: data?.rows ?? [],
    total: data?.total ?? 0,
    counts: data?.counts ?? { CORE: 0, WORKFORCE: 0, INDUSTRY: 0, HOLDINGS: 0 },
    companies: data?.companies ?? [],
    domains: data?.domains ?? [],
    period: data?.period ?? null,
    page,
    size,
    filters,
    isLoading,
    error,
    reload: load,
    setPage: (value: number) => {
      setPageState(value);
      writeUrl(filtersRef.current, value, sizeRef.current);
    },
    setSize: (value: number) => {
      storeSize(SIZE_KEY, value);
      setSizeState(value);
      setPageState(1);
      sizeRef.current = value;
      writeUrl(filtersRef.current, 1, value);
    },
    updateFilters,
  };
}
