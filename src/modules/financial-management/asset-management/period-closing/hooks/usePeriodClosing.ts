import { useState, useEffect, useCallback } from "react";
import type { PeriodCloseData } from "../types";
import { fetchPeriodCloseData, closePeriod, reopenPeriod } from "../providers/fetchProvider";
import { toast } from "sonner";

export function usePeriodClosing() {
  const [data, setData] = useState<PeriodCloseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected period to inspect posting & reopen
  const [selectedPostingYm, setSelectedPostingYm] = useState<string>("2026-10");
  const [selectedReopenYm, setSelectedReopenYm] = useState<string>("2026-10");
  const [selectedCloseTarget, setSelectedCloseTarget] = useState<string>("2026-10");
  const [reopenReason, setReopenReason] = useState<string>("");
  const [yearEndConfirmed, setYearEndConfirmed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchPeriodCloseData();
      setData(res);
      if (res.targetToClose) {
        setSelectedCloseTarget(res.targetToClose);
      }
      if (res.closedThrough) {
        setSelectedPostingYm(res.closedThrough);
        setSelectedReopenYm(res.closedThrough);
      } else if (res.months.length > 0) {
        setSelectedPostingYm(res.months[0].ym);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load period close data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectMonth = (ym: string) => {
    setSelectedPostingYm(ym);
    const m = data?.months.find((item) => item.ym === ym);
    if (m?.status === "Closed") {
      setSelectedReopenYm(ym);
    }
  };

  const handleClose = async () => {
    if (!selectedCloseTarget) return;
    setIsSubmitting(true);
    try {
      const res = await closePeriod(selectedCloseTarget, yearEndConfirmed);
      toast.success(res.message || `Closed through ${selectedCloseTarget}`);
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to close period");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopen = async () => {
    if (!reopenReason.trim()) {
      toast.error("Please enter a reason for reopening");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await reopenPeriod(reopenReason.trim(), selectedReopenYm);
      toast.success(res.message || "Period reopened");
      setReopenReason("");
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reopen period");
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    data,
    isLoading,
    error,
    selectedPostingYm,
    setSelectedPostingYm,
    selectedReopenYm,
    setSelectedReopenYm,
    selectedCloseTarget,
    setSelectedCloseTarget,
    reopenReason,
    setReopenReason,
    yearEndConfirmed,
    setYearEndConfirmed,
    isSubmitting,
    handleSelectMonth,
    handleClose,
    handleReopen,
    reload: loadData,
  };
}
