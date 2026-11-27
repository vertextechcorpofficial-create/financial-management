"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  createAssignment,
  decideChange,
  deleteAssignment,
  fetchGovernance,
  raiseChange,
  savePolicy,
} from "../providers/governanceApi";
import type { GovernancePayload } from "../types";

export function useGovernance() {
  const [data, setData] = useState<GovernancePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++seq.current;
    setIsLoading(true);
    try {
      const payload = await fetchGovernance();
      if (ticket === seq.current) {
        setData(payload);
        setError(null);
      }
    } catch (cause) {
      if (ticket === seq.current) setError(cause instanceof Error ? cause.message : "The access data could not be read.");
    } finally {
      if (ticket === seq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<void>, message: string) => {
      setIsSaving(true);
      try {
        await action();
        toast.success(message);
        await load();
        return true;
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "The change was refused.");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [load],
  );

  return {
    data,
    isLoading,
    isSaving,
    error,
    reload: load,
    addAssignment: (input: { userId: number; roleId: number; companyId: number }) =>
      run(() => createAssignment(input), "Access granted."),
    removeAssignment: (id: number) => run(() => deleteAssignment(id), "Access removed."),
    setPolicy: (key: string, value: string) => run(() => savePolicy(key, value), "Policy saved."),
    decide: (id: number, status: "APPROVED" | "REJECTED", note: string) =>
      run(() => decideChange(id, status, note), status === "APPROVED" ? "Change approved." : "Change rejected."),
    raise: (input: { summary: string; kpiId: number | null }) =>
      run(() => raiseChange(input), "Change raised for sign-off."),
  };
}
