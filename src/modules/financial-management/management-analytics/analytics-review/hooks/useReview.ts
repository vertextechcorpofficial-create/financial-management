"use client";

import { useCallback, useEffect, useState } from "react";

import { addAction, closeAction, fetchReview, openMeeting, patchItem, patchReview } from "../providers/reviewApi";
import type { ReviewDetail } from "../types";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function useReview(period: string, company: string) {
  // The route falls back to the newest month, so a half-typed month would show someone else's
  // data under the month the reader typed. Nothing loads until the month is a real one.
  const validPeriod = MONTH.test(period);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!validPeriod) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setDetail(await fetchReview(period, company));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The meeting could not be read.");
    } finally {
      setLoading(false);
    }
  }, [period, company, validPeriod]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<ReviewDetail>) => {
    setSaving(true);
    try {
      setDetail(await work());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return {
    validPeriod,
    detail,
    isLoading,
    isSaving,
    error,
    reload: load,
    open: () => run(() => openMeeting(period, company)),
    saveMeeting: (patch: { attendees?: string; minutes?: string; status?: "DRAFT" | "FINAL" }) =>
      run(async () => {
        if (!detail?.review) throw new Error("Open the meeting first.");
        return patchReview(detail.review.id, patch);
      }),
    saveItem: (id: number, patch: { notes?: string; decision?: string }) => run(async () => {
      await patchItem(id, patch);
      return fetchReview(period, company);
    }),
    addAction: (payload: { title: string; dueDate?: string; notes?: string }) =>
      run(async () => {
        await addAction({ ...payload, reviewId: detail?.review?.id, companyCode: detail?.company?.code });
        return fetchReview(period, company);
      }),
    closeAction: (id: number) => run(async () => {
      await closeAction(id);
      return fetchReview(period, company);
    }),
  };
}
