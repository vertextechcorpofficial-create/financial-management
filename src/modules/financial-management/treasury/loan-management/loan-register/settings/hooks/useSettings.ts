"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { AccountBody, AccountPatch, HolidayBody, HolidayPatch, LineAccountBody } from "../schemas";
import {
  closeBooks,
  createAccount,
  createHoliday,
  createMapping,
  deleteHoliday,
  fetchSettings,
  reopenBooks,
  updateAccount,
  updateHoliday,
  updateMapping,
} from "../providers/settingsApi";
import type { SettingsData } from "../types";

const EMPTY: SettingsData = {
  accounts: [],
  holidays: [],
  mappings: [],
  chartAccounts: [],
  locks: [],
  values: [],
  currentLock: null,
  unmappedKeys: [],
};

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useSettings() {
  const [data, setData] = useState<SettingsData>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const payload = await fetchSettings();
      if (seq !== requestSeq.current) return;
      setData(payload);
      setError(null);
    } catch (caught) {
      if (seq !== requestSeq.current) return;
      setData(EMPTY);
      setError(messageOf(caught, "The loan settings could not be read."));
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async <T,>(action: () => Promise<T>, success: string | ((result: T) => string)): Promise<T | null> => {
      setIsSaving(true);
      try {
        const result = await action();
        toast.success(typeof success === "function" ? success(result) : success);
        await load();
        return result;
      } catch (caught) {
        toast.error(messageOf(caught, "That change could not be saved."));
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [load],
  );

  const addAccount = useCallback(
    (body: AccountBody) => run(() => createAccount(body), (result) => `${result.name} added.`),
    [run],
  );

  const editAccount = useCallback(
    (id: number, patch: AccountPatch) =>
      run(
        () => updateAccount(id, patch),
        (result) => (result.note ? result.note : "Payment account updated."),
      ),
    [run],
  );

  const addHoliday = useCallback(
    (body: HolidayBody) => run(() => createHoliday(body), (result) => `${result.name} recorded for ${result.holidayDate}.`),
    [run],
  );

  const editHoliday = useCallback(
    (id: number, patch: HolidayPatch) => run(() => updateHoliday(id, patch), "Holiday updated."),
    [run],
  );

  const removeHoliday = useCallback(
    (id: number) => run(() => deleteHoliday(id), "Holiday removed."),
    [run],
  );

  const mapKey = useCallback(
    (mappingKey: string, coaId: number | null, description: string) =>
      run(
        () => updateMapping(mappingKey, coaId, description),
        (result) => (coaId === null ? `${result.mappingKey} unmapped.` : `${result.mappingKey} mapped.`),
      ),
    [run],
  );

  const addMapping = useCallback(
    (body: LineAccountBody) =>
      run(() => createMapping(body), (result) => `${result.mappingLabel} added to ${result.mappingGroup}.`),
    [run],
  );

  const lockPeriod = useCallback(
    (lockedThrough: string, note: string) =>
      run(() => closeBooks(lockedThrough, note), (result) => `Books closed through ${result.lockedThrough}.`),
    [run],
  );

  const reopenPeriod = useCallback(
    (id: number, reason: string) =>
      run(() => reopenBooks(id, reason), (result) => `Books reopened after ${result.lockedThrough}.`),
    [run],
  );

  return {
    ...data,
    isLoading,
    isSaving,
    error,
    reload: load,
    addAccount,
    editAccount,
    addHoliday,
    editHoliday,
    removeHoliday,
    mapKey,
    addMapping,
    lockPeriod,
    reopenPeriod,
  };
}
