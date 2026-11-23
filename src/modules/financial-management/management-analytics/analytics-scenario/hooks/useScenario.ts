"use client";

import * as React from "react";
import { toast } from "sonner";
import { activateScenario, deleteScenario, fetchScenario, saveScenario } from "../providers/scenarioApi";
import type { Levers, ScenarioPayload } from "../types";

export function useScenario() {
  const [data, setData] = React.useState<ScenarioPayload | null>(null);
  const [levers, setLevers] = React.useState<Levers[]>([]);
  const [fxPct, setFxPct] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await fetchScenario();
      setData(payload);
      if (!loaded) {
        setLevers(payload.levers);
        setFxPct(payload.result.fxPct);
        setLoaded(true);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The planner could not be read.");
    } finally {
      setIsLoading(false);
    }
  }, [loaded]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const setLever = React.useCallback((code: string, field: keyof Omit<Levers, "code">, value: number) => {
    setLevers((current) =>
      current.map((row) => (row.code === code ? { ...row, [field]: Number.isFinite(value) ? value : 0 } : row)),
    );
  }, []);

  const reset = React.useCallback(() => {
    setLevers((current) => current.map((row) => ({ ...row, revenuePct: 0, cmPoints: 0, fixedPct: 0, cccDays: 0 })));
    setFxPct(0);
  }, []);

  const save = React.useCallback(
    async (input: { name: string; basePeriod: string; note: string | null }) => {
      setIsSaving(true);
      try {
        const created = await saveScenario({ ...input, fxPct, levers });
        toast.success(`${created.name} saved and made the live scenario.`);
        await load();
        return created;
      } catch (saveError) {
        toast.error(saveError instanceof Error ? saveError.message : "The scenario could not be saved.");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [fxPct, levers, load],
  );

  const activate = React.useCallback(
    async (id: number) => {
      try {
        const row = await activateScenario(id);
        toast.success(`${row.name} is the live scenario.`);
        setLoaded(false);
        await load();
      } catch (actionError) {
        toast.error(actionError instanceof Error ? actionError.message : "The scenario could not be activated.");
      }
    },
    [load],
  );

  const remove = React.useCallback(
    async (id: number, name: string) => {
      try {
        await deleteScenario(id);
        toast.success(`${name} removed.`);
        await load();
      } catch (actionError) {
        toast.error(actionError instanceof Error ? actionError.message : "The scenario could not be removed.");
      }
    },
    [load],
  );

  return {
    data,
    levers,
    fxPct,
    setFxPct,
    setLever,
    reset,
    save,
    activate,
    remove,
    isLoading,
    isSaving,
    error,
    reload: load,
  };
}
