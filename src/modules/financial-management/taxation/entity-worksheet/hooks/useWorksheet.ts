"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { EntityProfile, EntitySnapshot, RegistryCompany } from "../types";
import {
  WorksheetApiError,
  fetchWorksheet,
  recordCarryoverLot as requestCarryoverLot,
  updateOpeningCarryovers as requestOpeningUpdate,
  saveProfile as requestProfileSave,
  updateCarryoverUsed as requestCarryoverUsed,
  type CarryoverLotPayload,
} from "../providers/worksheetApi";

export function useWorksheet(initialYear: number) {
  const [companies, setCompanies] = useState<RegistryCompany[]>([]);
  const [snapshot, setSnapshot] = useState<EntitySnapshot | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [year, setYear] = useState(initialYear);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumped whenever the stored profile changes, so the profile form remounts with fresh values. */
  const [profileRev, setProfileRev] = useState(0);

  /**
   * W5: a refresh that hits a failing source must not destroy what the desk already read.
   * The last readable snapshot per company-year is kept for the session so the page can show
   * it behind a staleness banner instead of an empty screen.
   */
  const lastGood = useRef(new Map<string, { snapshot: EntitySnapshot; at: number }>());

  const load = useCallback(
    async (nextCompanyId: number, nextYear: number, options?: { quiet?: boolean; fresh?: boolean }) => {
      if (!options?.quiet) setIsLoading(true);
      setError(null);
      try {
        const payload = await fetchWorksheet(nextCompanyId, nextYear, options?.fresh === true);
        setCompanies(payload.companies);
        if (payload.snapshot.figuresAvailable) {
          lastGood.current.set(`${nextCompanyId}:${nextYear}`, { snapshot: payload.snapshot, at: Date.now() });
        }
        setSnapshot(payload.snapshot);
        setProfileRev((current) => current + 1);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Could not build the worksheet.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await fetchWorksheet(1, initialYear);
        if (cancelled) return;
        setCompanies(payload.companies);
        if (payload.snapshot.figuresAvailable) {
          lastGood.current.set(`${payload.snapshot.company.companyId}:${initialYear}`, {
            snapshot: payload.snapshot,
            at: Date.now(),
          });
        }
        setSnapshot(payload.snapshot);
        setCompanyId(payload.snapshot.company.companyId);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Could not build the worksheet.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialYear]);

  const selectCompany = useCallback(
    (nextCompanyId: number) => {
      setCompanyId(nextCompanyId);
      void load(nextCompanyId, year);
    },
    [load, year],
  );

  const selectYear = useCallback(
    (nextYear: number) => {
      setYear(nextYear);
      if (companyId) void load(companyId, nextYear);
    },
    [companyId, load],
  );

  /** Saves the whole profile once. Returns false so the form can keep the draft on failure. */
  const saveProfile = useCallback(
    async (next: EntityProfile): Promise<boolean> => {
      setIsSaving(true);
      try {
        const saved = await requestProfileSave(next);
        setSnapshot((current) => (current ? { ...current, profile: saved } : current));
        setProfileRev((current) => current + 1);
        toast.success("Tax profile saved.");
        // Fresh: the save already invalidated the server snapshot, and a second read must not race it.
        await load(saved.companyId, saved.taxYear, { quiet: true, fresh: true });
        return true;
      } catch (caught) {
        const message = caught instanceof WorksheetApiError || caught instanceof Error ? caught.message : null;
        toast.error(message || "The profile could not be saved.");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [load],
  );

  /**
   * Records one carryover lot and re-reads the sheet so lines 8 and 12 pick it up (W4/G7).
   * Returns false on failure so the dialog keeps the draft.
   */
  const saveCarryoverLot = useCallback(
    async (input: CarryoverLotPayload): Promise<boolean> => {
      setIsSaving(true);
      try {
        await requestCarryoverLot(input);
        toast.success(`${input.kind} lot for ${input.originYear} recorded.`);
        await load(input.companyId, input.taxYear, { quiet: true, fresh: true });
        return true;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : null;
        toast.error(message || "The carryover lot could not be recorded.");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [load],
  );

  /** Corrects how much of a lot this year used; the lot's remaining balance follows. */
  const saveCarryoverUsed = useCallback(
    async (id: number, amountUsed: number): Promise<boolean> => {
      if (companyId == null) return false;
      setIsSaving(true);
      try {
        await requestCarryoverUsed({ companyId, taxYear: year, id, amountUsed });
        toast.success("Carryover used amount updated.");
        await load(companyId, year, { quiet: true, fresh: true });
        return true;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : null;
        toast.error(message || "The carryover lot could not be updated.");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [companyId, load, year],
  );

  /** P71: accept last year's closing balances as this year's openings. */
  const updateOpenings = useCallback(async (): Promise<boolean> => {
    if (companyId == null) return false;
    setIsSaving(true);
    try {
      const result = await requestOpeningUpdate({ companyId, taxYear: year });
      toast.success(
        result.updated === 1 ? "One opening updated." : `${result.updated} openings updated.`,
      );
      await load(companyId, year, { quiet: true, fresh: true });
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : null;
      toast.error(message || "The carryover openings could not be updated.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [companyId, load, year]);

  const companyOptions = useMemo(
    () =>
      companies.map((company) => ({
        value: String(company.companyId),
        label: `${company.code} · ${company.name}`,
        // The endpoint URL used to render here and swallowed the row: a host name is not a label.
        searchText: `${company.code} ${company.name} ${company.baseUrl}`,
        description: company.reachable ? undefined : `Unreachable — ${company.unreachableReason ?? "no answer"}`,
      })),
    [companies],
  );

  const key = companyId == null ? null : `${companyId}:${year}`;
  const fallback = key ? (lastGood.current.get(key) ?? null) : null;

  return {
    companies,
    companyOptions,
    companyId,
    year,
    snapshot,
    lastGood: fallback,
    isLoading,
    isSaving,
    error,
    profileRev,
    selectCompany,
    selectYear,
    saveProfile,
    saveCarryoverLot,
    saveCarryoverUsed,
    updateOpenings,
    // Refresh means "pull again", so it bypasses the server's short-lived snapshot cache.
    refetch: () => (companyId ? load(companyId, year, { fresh: true }) : Promise.resolve()),
  };
}

