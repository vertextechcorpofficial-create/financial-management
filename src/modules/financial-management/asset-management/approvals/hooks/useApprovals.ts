"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import type { ApprovalsData } from "../types";
import { fetchApprovals, approveEvent, rejectEvent } from "../providers/fetchProvider";

export function useApprovals() {
  const [data, setData] = useState<ApprovalsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchApprovals();
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load approvals.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (id: number) => {
    try {
      setProcessingId(id);
      await approveEvent(id);
      toast.success("Entry approved and posted.");
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to approve entry.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: number, reason: string) => {
    if (!reason.trim()) {
      toast.error("Please provide a reason to reject.");
      return;
    }
    try {
      setProcessingId(id);
      await rejectEvent(id, reason);
      toast.success("Entry rejected.");
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reject entry.");
    } finally {
      setProcessingId(null);
    }
  };

  return {
    data,
    isLoading,
    error,
    processingId,
    handleApprove,
    handleReject,
    refresh: loadData,
  };
}
