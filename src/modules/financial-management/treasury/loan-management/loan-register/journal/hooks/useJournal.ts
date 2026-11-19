"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchEntries, fetchSummary, type JournalRequest } from "../providers/journalApi";
import type { EntriesPayload, EntryType, SummaryPayload } from "../types";

export interface JournalFilters {
  q: string;
  loanId: number | null;
  entryType: EntryType | "ALL";
  coaId: number | null;
  from: string;
  to: string;
}

export const EMPTY_FILTERS: JournalFilters = {
  q: "",
  loanId: null,
  entryType: "ALL",
  coaId: null,
  from: "",
  to: "",
};

export function filtersAreActive(filters: JournalFilters): boolean {
  return (
    filters.q.trim().length > 0 ||
    filters.loanId !== null ||
    filters.entryType !== "ALL" ||
    filters.coaId !== null ||
    filters.from !== "" ||
    filters.to !== ""
  );
}

interface Shared {
  page: number;
  pageSize: number;
  filters: JournalFilters;
}

function useJournalData<T>(
  view: "entries" | "summary",
  shared: Shared,
  fetcher: (request: JournalRequest) => Promise<T>,
  fallbackMessage: string,
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const payload = await fetcher({ view, ...shared.filters, page: shared.page, pageSize: shared.pageSize });
      if (seq !== requestSeq.current) return;
      setData(payload);
      setError(null);
    } catch (caught) {
      if (seq !== requestSeq.current) return;
      setData(null);
      setError(caught instanceof Error ? caught.message : fallbackMessage);
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [fetcher, fallbackMessage, shared.filters, shared.page, shared.pageSize, view]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, isLoading, error };
}

export function useEntries(shared: Shared) {
  const state = useJournalData<EntriesPayload>("entries", shared, fetchEntries, "The journal entries could not be read.");
  return { ...state, payload: state.data };
}

export function useSummary(shared: Shared) {
  const state = useJournalData<SummaryPayload>("summary", shared, fetchSummary, "The account summary could not be read.");
  return { ...state, payload: state.data };
}
