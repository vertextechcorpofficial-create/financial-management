"use client";
import { useCallback, useRef, useState } from "react";
import { onboardingApi, onboardingRequestId, OnboardingError } from "../providers/onboarding.api";
import { isUnauthorized } from "../utils/sessionExpiry";
import { useCachedRead } from "./useCachedRead";

export function useOnboardingRead<T>(path: string, delay = 0) {
  const read = useCachedRead<T>({
    namespace: "onboarding",
    path,
    delay,
    load: onboardingApi,
    errorMessage: "Unable to load Onboarding.",
    ignoreUnauthorized: true,
  });
  return { ...read, data: read.data ?? null, error: read.error ?? null };
}
export function useOnboardingCommand() {
  const active = useRef(false); const identity = useRef<{ fingerprint: string; key: string } | null>(null);
  const failure = useRef<Error | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<Error | null>(null);
  async function run<T>(path: string, method: "POST" | "PUT" | "PATCH", payload: object): Promise<T | null> {
    if (active.current) return null; active.current = true; failure.current = null; setBusy(true); setError(null);
    try {
      const fingerprint = JSON.stringify([path, method, payload]);
      if (identity.current?.fingerprint !== fingerprint) identity.current = { fingerprint, key: onboardingRequestId() };
      const data = await onboardingApi<T>(path, { method, body: JSON.stringify({ ...payload, requestId: identity.current.key }) });
      identity.current = null; return data;
    } catch (cause) { if (isUnauthorized(cause)) return null; failure.current = cause instanceof Error ? cause : new OnboardingError("Unable to save Onboarding.", 503); setError(failure.current); return null; }
    finally { active.current = false; setBusy(false); }
  }
  const clearError = useCallback(() => { failure.current = null; setError(null); }, []);
  return { run, busy, error, failure, clearError };
}
