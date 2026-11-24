"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { LOAN_PAGE_SIZE } from "../constants";
import {
  approveLoan as approveRequest,
  fetchDetail,
  fetchQueue,
  rejectLoan as rejectRequest,
  type QueuePayload,
} from "../providers/approvalsApi";
import type { ReleaseChannel } from "../types";

export interface ApprovalFilters {
  q: string;
  status: string;
  lenderType: string;
}

const EMPTY: QueuePayload = { rows: [], total: 0 };

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function useApprovals(pageSize: number) {
  const [filters, setFilters] = useState<ApprovalFilters>({
    q: "",
    status: "ALL",
    lenderType: "ALL",
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QueuePayload>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const payload = await fetchQueue({
        ...filters,
        page,
        pageSize: pageSize || LOAN_PAGE_SIZE,
      });
      if (seq !== requestSeq.current) return;
      setData(payload);
      setError(null);
    } catch (cause) {
      if (seq !== requestSeq.current) return;
      setError(messageOf(cause, "The approvals queue could not be read."));
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateFilters = useCallback((next: Partial<ApprovalFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
  }, []);

  const loadDetail = useCallback(
    async (
      id: number,
      channel: ReleaseChannel = "TRANSFER",
      accountId: number | null = null,
    ) => {
      try {
        return await fetchDetail(id, channel, accountId);
      } catch (cause) {
        toast.error(messageOf(cause, "That loan could not be read."));
        return null;
      }
    },
    [],
  );

  const approve = useCallback(async (id: number, remarks: string) => {
    setIsSaving(true);
    try {
      const result = await approveRequest(id, remarks);
      toast.success(
        `${result.loanNo} approved · ${result.entryNo} posted${result.scheduleRows > 0 ? ` · ${result.scheduleRows} installments scheduled` : ""}`,
      );
      return result;
    } catch (cause) {
      toast.error(messageOf(cause, "The loan could not be approved."));
      return null;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const reject = useCallback(async (id: number, reason: string) => {
    setIsSaving(true);
    try {
      const result = await rejectRequest(id, reason);
      toast.success(
        `${result.loanNo} rejected. The preparer sees your reason.`,
      );
      return result;
    } catch (cause) {
      toast.error(messageOf(cause, "The loan could not be rejected."));
      return null;
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    rows: data.rows,
    total: data.total,
    filters,
    page,
    isLoading,
    isSaving,
    error,
    reload: load,
    setPage,
    updateFilters,
    loadDetail,
    approve,
    reject,
  };
}
