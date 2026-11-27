"use client";
import { useCallback, useRef, useState } from "react";
import { replenishmentApi, recoverReplenishmentRequest } from "../providers/replenishment.api";
import { onboardingRequestId, OnboardingError } from "../providers/onboarding.api";
import { useCachedRead } from "./useCachedRead";
export function useReplenishmentRead<T>(path: string | null, delay = 0) {
  const read = useCachedRead<T>({
    namespace: "replenishment",
    path,
    delay,
    load: replenishmentApi,
    errorMessage: "Unable to load replenishment.",
  });
  return { ...read, data: read.data ?? null, error: read.error ?? null };
}
export function useReplenishmentCommand() {
  const active = useRef(false), identity = useRef<{ fingerprint: string; key: string } | null>(null);
  const lastCall = useRef<{ path: string; method: "POST" | "PUT"; payload: object } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<Error | null>(null);
  const run = useCallback(async <T,>(path: string, method: "POST" | "PUT", payload: object): Promise<T | null> => {
    if (active.current) return null;
    active.current = true; setBusy(true); setError(null);
    lastCall.current = { path, method, payload };
    try {
      const fingerprint = JSON.stringify([path, method, payload]);
      if (identity.current && identity.current.fingerprint !== fingerprint) {
        const previous = await recoverReplenishmentRequest(identity.current.key);
        if (previous && previous.state !== "COMPLETED") throw new Error("The previous request is still in progress. Retry after it completes.");
        identity.current = null;
      }
      identity.current ??= { fingerprint, key: onboardingRequestId() };
      let result: T;
      try { result = await replenishmentApi<T>(path, { method, body: JSON.stringify({ ...payload, requestId: identity.current.key }) }); }
      catch (cause) {
        if (cause instanceof OnboardingError && cause.status < 500) throw cause;
        const recovered = await recoverReplenishmentRequest(identity.current.key);
        if (recovered?.state !== "COMPLETED" || !recovered.result.record) throw cause;
        result = recovered.result.record as T;
      }
      identity.current = null; return result;
    } catch (cause) { setError(cause instanceof Error ? cause : new Error("Unable to save replenishment.")); return null; }
    finally { active.current = false; setBusy(false); }
  }, []);
  const retry = useCallback(() => lastCall.current ? run(lastCall.current.path, lastCall.current.method, lastCall.current.payload) : Promise.resolve(null), [run]);
  const clearError = useCallback(() => setError(null), []);
  return { run, retry, clearError, busy, error };
}
