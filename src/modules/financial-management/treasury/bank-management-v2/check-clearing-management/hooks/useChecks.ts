"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { STALE_CHECK_DAYS } from "../constants";
import { phtToday } from "../pht";
import type { BankCheck, CheckEvent, CheckStatus, CheckbookSeries } from "../types";
import {
  actOnCheck,
  clearChecks,
  createCheckbook,
  depositChecks,
  fetchCheckDetail,
  fetchRegister,
  issueCheck,
  listCheckbooks,
  receiveCheck,
  releaseChecks,
  type CheckActionPayload,
  type CheckCounts,
  type IssueCheckPayload,
  type ReceiveCheckPayload,
  type RegisterFilters,
} from "../providers/checksApi";

const EMPTY_COUNTS: CheckCounts = {
  PENDING: 0,
  RECEIVED: 0,
  IN_CLEARING: 0,
  CLEARED: 0,
  RETURNED: 0,
  CANCELLED: 0,
};

/** State for the check register: filters, rows, per-status counts and every mutation. */
export function useChecks(initialFilters: RegisterFilters = {}) {
  const [filters, setFilters] = useState<RegisterFilters>({ direction: "ALL", status: "ALL", ...initialFilters });
  const [allChecks, setAllChecks] = useState<BankCheck[]>([]);
  const [serverCounts, setServerCounts] = useState<CheckCounts>(EMPTY_COUNTS);
  const [accounts, setAccounts] = useState<{ bankId: number; label: string; bankName: string; accountNumber: string | null }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // The pager's rows-per-page lives here; the stored value keeps the reader's choice across visits.
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window === "undefined") return 10;
    const stored = Number(window.localStorage.getItem("fm.check-clearing.rows"));
    return [5, 10, 25, 50].includes(stored) ? stored : 10;
  });

  const updateFilters = useCallback<Dispatch<SetStateAction<RegisterFilters>>>((next) => {
    setFilters(next);
    setPage(1);
  }, []);

  // Only the newest request may write state: a slow response must not overwrite a newer reload.
  const requestSeq = useRef(0);

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    setError(null);
    try {
      const register = await fetchRegister({ page: 1, pageSize: 500 });
      if (seq !== requestSeq.current) return;
      setAllChecks(register.checks);
      setServerCounts(register.counts ?? EMPTY_COUNTS);
      setAccounts(register.accounts ?? []);
      setNotice(register.notice ?? null);
    } catch (caught) {
      if (seq !== requestSeq.current) return;
      setError(caught instanceof Error ? caught.message : "Could not load the check register.");
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const counts = useMemo<CheckCounts>(() => {
    if (allChecks.length === 0) return serverCounts;
    const next: CheckCounts = { ...EMPTY_COUNTS };
    for (const row of allChecks) {
      next[row.status] = (next[row.status] ?? 0) + 1;
    }
    return next;
  }, [allChecks, serverCounts]);

  const filteredChecks = useMemo(() => {
    const bankAccountIds = filters.bank
      ? new Set(accounts.filter((account) => account.bankName === filters.bank).map((account) => account.bankId))
      : null;
    const q = (filters.q ?? "").trim().toLowerCase();
    const payee = (filters.payee ?? "").trim().toLowerCase();
    const today = phtToday();
    const staleBefore = new Date(Date.parse(`${today}T00:00:00Z`) - STALE_CHECK_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    return allChecks.filter((check) => {
      if (filters.direction && filters.direction !== "ALL" && check.direction !== filters.direction) return false;
      if (filters.status && filters.status !== "ALL" && check.status !== filters.status) return false;
      if (filters.accountId !== undefined && check.bankAccountId !== filters.accountId) return false;
      if (bankAccountIds && !bankAccountIds.has(check.bankAccountId)) return false;
      if (payee) {
        const matchPayee = (check.payee ?? "").toLowerCase().includes(payee);
        const matchPayor = (check.payor ?? "").toLowerCase().includes(payee);
        if (!matchPayee && !matchPayor) return false;
      }
      if (filters.from && check.checkDate < filters.from) return false;
      if (filters.to && check.checkDate > filters.to) return false;
      if (filters.flag === "PDC") {
        if (!["PENDING", "RECEIVED", "IN_CLEARING"].includes(check.status) || check.checkDate <= today) return false;
      } else if (filters.flag === "STALE") {
        if (check.direction !== "ISSUED" || !["PENDING", "IN_CLEARING"].includes(check.status) || check.checkDate >= staleBefore) {
          return false;
        }
      } else if (filters.flag === "NOREPL") {
        if ((check.status !== "RETURNED" && check.status !== "CANCELLED") || check.replacedById !== null) return false;
      } else if (filters.flag === "REPL") {
        if (check.replacesId === null && check.replacedById === null) return false;
      }
      if (q) {
        const hay = [check.checkNo, check.payee, check.payor, check.draweeBank, check.returnReason, check.remarks];
        if (!hay.some((value) => (value ?? "").toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [allChecks, filters, accounts]);

  const total = filteredChecks.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const checks = useMemo(
    () => filteredChecks.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredChecks, safePage, pageSize],
  );

  // Written on change rather than in an effect: the pager already calls this, and a write in the
  // click handler keeps the stored value in step without a second render.
  const rememberPageSize = useCallback((size: number) => {
    setPageSize(size);
    try {
      window.localStorage.setItem("fm.check-clearing.rows", String(size));
    } catch {
      // A blocked storage quota must not stop the reader changing the page size.
    }
  }, []);

  const statusTiles = useMemo(
    () =>
      (Object.keys(EMPTY_COUNTS) as CheckStatus[]).map((status) => ({
        status,
        count: counts[status] ?? 0,
      })),
    [counts],
  );

  const run = useCallback(
    async <T,>(action: () => Promise<T>, successMessage: string, onResult?: (result: T) => void): Promise<T | null> => {
      setIsSaving(true);
      try {
        const result = await action();
        onResult?.(result);
        await refetch();
        toast.success(successMessage);
        return result;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "The action failed.";
        toast.error(message);
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [refetch],
  );

  const issue = useCallback(
    (payload: IssueCheckPayload) =>
      run(
        () => issueCheck(payload),
        "Check issued",
        (result) => setAllChecks((prev) => [result.check, ...prev]),
      ),
    [run],
  );

  const receive = useCallback(
    (payload: ReceiveCheckPayload) =>
      run(
        () => receiveCheck(payload),
        "Check recorded",
        (result) => setAllChecks((prev) => [result.check, ...prev]),
      ),
    [run],
  );

  const act = useCallback(
    (check: BankCheck, payload: CheckActionPayload) =>
      run(
        () => actOnCheck(check.id, payload),
        `${payload.action.charAt(0)}${payload.action.slice(1).toLowerCase()} recorded`,
        (result) =>
          setAllChecks((prev) => prev.map((row) => (row.id === result.check.id ? result.check : row))),
      ),
    [run],
  );

  const bulkClear = useCallback(
    async (entries: { checkId: number; clearedDate: string }[]) => {
      setIsSaving(true);
      try {
        const result = await clearChecks(entries);
        await refetch();
        if (result.failures.length) {
          toast.error(`${result.failures.length} check(s) could not be cleared: ${result.failures[0].message}`);
        } else {
          toast.success(`${result.cleared.length} check(s) cleared`);
        }
        return result;
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : "The checks could not be cleared.");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [refetch],
  );

  const batchRelease = useCallback(
    async (entries: { checkId: number; date: string }[]) => {
      setIsSaving(true);
      try {
        const result = await releaseChecks(entries);
        await refetch();
        if (result.failures.length) {
          toast.error(`${result.failures.length} check(s) could not be released: ${result.failures[0].message}`);
        } else {
          toast.success(`${result.checks.length} check(s) released`);
        }
        return result;
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : "The checks could not be released.");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [refetch],
  );

  const batchDeposit = useCallback(
    async (entries: { checkId: number; date: string }[]) => {
      setIsSaving(true);
      try {
        const result = await depositChecks(entries);
        await refetch();
        if (result.failures.length) {
          toast.error(`${result.failures.length} check(s) could not be deposited: ${result.failures[0].message}`);
        } else {
          toast.success(`${result.checks.length} check(s) deposited`);
        }
        return result;
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : "The checks could not be deposited.");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [refetch],
  );

  const addSeries = useCallback(
    (payload: { bankAccountId: number; seriesStart: string; seriesEnd: string }) =>
      run(() => createCheckbook(payload), "Checkbook series added"),
    [run],
  );

  const loadSeries = useCallback(async (): Promise<{ series: CheckbookSeries[]; notice?: string } | null> => {
    try {
      return await listCheckbooks();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not load the checkbook series.");
      return null;
    }
  }, []);

  const loadDetail = useCallback(    async (checkId: number): Promise<{ check: BankCheck; events: CheckEvent[] } | null> => {
      try {
        return await fetchCheckDetail(checkId);
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : "Could not load the check.");
        return null;
      }
    },
    [],
  );

  return {
    allChecks,
    checks,
    counts,
    statusTiles,
    accounts,
    notice,
    filters,
    setFilters: updateFilters,
    page: safePage,
    setPage,
    pageSize,
    setPageSize: rememberPageSize,
    total,
    isLoading,
    isSaving,
    error,
    refetch,
    issue,
    receive,
    act,
    bulkClear,
    batchRelease,
    batchDeposit,
    addSeries,
    loadSeries,
    loadDetail,
  };
}
