"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import type {
  ImpairmentReviewData,
  StartReviewPayload,
  ReviewLineItem,
  UpdateLinePayload,
} from "../types";
import {
  fetchImpairmentReview,
  startImpairmentReview,
  updateReviewDetails,
  discardReview,
  updateLineDetails,
  toggleLineObsolete,
  postImpairmentEntries,
  signOffImpairmentReview,
} from "../providers/fetchProvider";
import type { ExternalIndicatorsState } from "../components/ExternalIndicatorsSection";

export function useImpairmentReview() {
  const [data, setData] = useState<ImpairmentReviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isSigningOff, setIsSigningOff] = useState(false);

  const [externalIndicators, setExternalIndicators] = useState<ExternalIndicatorsState>({
    marketMachinery: false,
    marketTransportation: false,
    marketIT: false,
    marketFurniture: false,
    interestRatesIncreased: false,
    idleMonths: 6,
    repairPercent: 25,
    showAllAssets: false,
  });

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchImpairmentReview();
      setData(res);
      if (res.review) {
        setExternalIndicators((prev) => ({
          ...prev,
          interestRatesIncreased: res.review?.interest_rates_increased ?? false,
          idleMonths: res.review?.idle_months_threshold ?? 6,
          repairPercent: res.review?.maintenance_pct_threshold ?? 25,
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load impairment review.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartReview = async (payload: StartReviewPayload) => {
    try {
      setIsStarting(true);
      await startImpairmentReview(payload);
      toast.success("Impairment review started.");
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start review.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleUpdateReviewDate = async (newDate: string) => {
    if (!data?.review?.id) return;
    try {
      await updateReviewDetails(data.review.id, { review_date: newDate });
      toast.success("Review date updated.");
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update review date.");
    }
  };

  const handleDiscardReview = async () => {
    if (!data?.review?.id) return;
    try {
      await discardReview(data.review.id);
      toast.success("Review reset. Returned to start setup.");
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reset review.");
    }
  };

  const handleUpdateLine = async (lineId: number, payload: UpdateLinePayload) => {
    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      const matchedConclusion = payload.conclusion_id
        ? prev.conclusions.find((c) => c.id === payload.conclusion_id)
        : null;

      const updatedLines = prev.lines.map((l) => {
        if (l.id !== lineId) return l;

        const updatedConclusionId =
          payload.conclusion_id !== undefined ? payload.conclusion_id : l.conclusion_id;

        return {
          ...l,
          ...payload,
          conclusion_id: updatedConclusionId,
          conclusion_name:
            payload.conclusion_id !== undefined
              ? matchedConclusion?.name || null
              : l.conclusion_name,
          conclusion_code:
            payload.conclusion_id !== undefined
              ? matchedConclusion?.code || null
              : l.conclusion_code,
        };
      });

      const concludedCount = updatedLines.filter((l) => !!l.conclusion_id).length;
      return {
        ...prev,
        lines: updatedLines,
        kpis: prev.kpis ? { ...prev.kpis, concludedCount } : null,
      };
    });

    try {
      await updateLineDetails(lineId, payload);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save update.");
      await loadData();
    }
  };

  const handleToggleObsolete = async (lineId: number, isObsolete: boolean) => {
    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      const updatedLines = prev.lines.map((l) => {
        if (l.id !== lineId) return l;
        let newIndicators = [...l.indicators];
        if (isObsolete) {
          if (!newIndicators.some((i) => i.type === "obsolete")) {
            newIndicators.push({
              id: 8,
              code: "OBSOLETE",
              label: "Obsolete / technologically superseded (flagged)",
              type: "obsolete",
            });
          }
        } else {
          newIndicators = newIndicators.filter((i) => i.type !== "obsolete");
        }
        return {
          ...l,
          is_obsolete: isObsolete,
          indicators: newIndicators,
        };
      });
      return {
        ...prev,
        lines: updatedLines,
      };
    });

    try {
      await toggleLineObsolete(lineId, isObsolete);
      toast.success(isObsolete ? "Flagged as obsolete." : "Removed obsolete flag.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update flag.");
      await loadData();
    }
  };

  const handlePostEntries = async () => {
    if (!data?.review?.id) return;
    try {
      setIsPosting(true);
      const res = await postImpairmentEntries(data.review.id);
      toast.success(`Created ${res.count} accounting entries for Approvals / posting.`);
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to post entries.");
    } finally {
      setIsPosting(false);
    }
  };

  const handleSignOff = async () => {
    if (!data?.review?.id) return;
    try {
      setIsSigningOff(true);
      await signOffImpairmentReview(data.review.id);
      toast.success("Impairment review signed off and frozen for auditor evidence.");
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to sign off review.");
    } finally {
      setIsSigningOff(false);
    }
  };

  const handleExternalIndicatorsChange = (updates: Partial<ExternalIndicatorsState>) => {
    setExternalIndicators((prev) => ({ ...prev, ...updates }));
  };

  const filteredLines = useMemo(() => {
    if (!data?.lines) return [];
    if (externalIndicators.showAllAssets) return data.lines;

    return data.lines.filter((line: ReviewLineItem) => {
      if (line.indicators.length > 0 || line.is_obsolete) return true;
      if (externalIndicators.interestRatesIncreased) return true;
      if (
        externalIndicators.marketMachinery &&
        line.classification_name.toLowerCase().includes("machin")
      ) {
        return true;
      }
      if (
        externalIndicators.marketTransportation &&
        line.classification_name.toLowerCase().includes("transport")
      ) {
        return true;
      }
      if (
        externalIndicators.marketIT &&
        line.classification_name.toLowerCase().includes("it")
      ) {
        return true;
      }
      if (
        externalIndicators.marketFurniture &&
        line.classification_name.toLowerCase().includes("furnitur")
      ) {
        return true;
      }
      return false;
    });
  }, [data?.lines, externalIndicators]);

  return {
    data,
    isLoading,
    error,
    isStarting,
    isPosting,
    isSigningOff,
    externalIndicators,
    handleExternalIndicatorsChange,
    filteredLines,
    handleStartReview,
    handleUpdateReviewDate,
    handleDiscardReview,
    handleUpdateLine,
    handleToggleObsolete,
    handlePostEntries,
    handleSignOff,
    refresh: loadData,
  };
}
