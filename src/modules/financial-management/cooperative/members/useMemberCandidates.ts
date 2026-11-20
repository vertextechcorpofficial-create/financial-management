"use client";

import { useEffect, useState } from "react";
import { memberFetch } from "./client";
import type { MemberCandidatePage } from "./types";

type CandidateResult = MemberCandidatePage & { key: string; error: string };

export function useMemberCandidates() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([search, page, attempt]);
  const [result, setResult] = useState<CandidateResult | null>(null);
  const current = result?.key === key ? result : null;
  const loading = open && !current;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (search.trim()) params.set("q", search.trim());
        const payload = await memberFetch<MemberCandidatePage>(
          `/api/fm/cooperative/members/candidates?${params}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setResult({ key, ...payload, error: "" });
      } catch (cause) {
        if (!controller.signal.aborted && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setResult({
            key,
            items: [],
            page,
            pageSize: 10,
            total: 0,
            hasMore: false,
            payrollUnavailable: false,
            error: cause instanceof Error ? cause.message : "Unable to load employees.",
          });
        }
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, search, page, attempt, key]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSearch("");
      setPage(1);
      setResult(null);
    }
  }

  function onSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function reload() {
    setResult(null);
    setAttempt(value => value + 1);
  }

  return {
    open,
    onOpenChange,
    search,
    onSearchChange,
    page,
    pageSize: current?.pageSize ?? 10,
    items: current?.items ?? [],
    total: current?.total ?? 0,
    hasMore: current?.hasMore ?? false,
    payrollUnavailable: current?.payrollUnavailable ?? false,
    loading,
    error: current?.error ?? "",
    previous: () => setPage(value => Math.max(1, value - 1)),
    next: () => setPage(value => value + 1),
    reload,
  };
}
