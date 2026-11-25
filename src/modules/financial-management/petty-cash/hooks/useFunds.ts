"use client";
import { useCallback, useRef, useState } from "react";
import { fundApi } from "../providers/funds.api";
import { onboardingRequestId, OnboardingError } from "../providers/onboarding.api";
import { useCachedRead } from "./useCachedRead";
import type { FundDetails } from "../fund-types";

export function useFundRead<T>(path: string | null, delay = 0) {
  return useCachedRead<T>({
    namespace: "funds",
    path,
    delay,
    load: fundApi,
    errorMessage: "Unable to load funds.",
  });
}
export function useFundDecision<T = FundDetails>() {
  const pending = useRef<{ key: string; path: string; payload: object } | null>(null), active = useRef(false);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState<Error | null>(null);
  async function completed() {
    if (!pending.current) return null;
    try {
      const status = await fundApi<{ state: string; result: { record?: T } }>(`requests/${pending.current.key}`);
      return status.state === "COMPLETED" ? status.result.record ?? null : null;
    } catch { return null; }
  }
  async function run(path: string, payload: object): Promise<T | null> {
    if (active.current) return null;
    active.current = true; setBusy(true); setError(null);
    try {
      if (!pending.current) pending.current = { key: onboardingRequestId(), path, payload };
      else {
        const previous = await completed();
        if (previous) { pending.current = null; setUncertain(false); return previous; }
      }
      const request = pending.current;
      const result = await fundApi<T>(request.path, { method: "POST", body: JSON.stringify({ ...request.payload, requestId: request.key }) });
      pending.current = null; setUncertain(false); return result;
    } catch (cause) {
      const previous = await completed();
      if (previous) { pending.current = null; setUncertain(false); return previous; }
      const failure = cause instanceof Error ? cause : new Error("Unable to complete the decision.");
      const unresolved = pending.current !== null && (!(failure instanceof OnboardingError) || failure.status >= 500);
      if (!unresolved) pending.current = null;
      setUncertain(unresolved); setError(failure); return null;
    } finally { active.current = false; setBusy(false); }
  }
  const clearError = useCallback(() => setError(null), []);
  return { run, busy, uncertain, error, clearError, retry: () => pending.current ? run(pending.current.path, pending.current.payload) : Promise.resolve(null) };
}
