"use client";

import { useEffect, useRef, useState } from "react";
import { fieldErrorsFrom, MemberApiError, memberFetch, newRequestKey } from "../../members/client";
import type { ClearanceActionResult } from "../../server/clearance-commands";

export const clearanceEndpoint = "/api/fm/cooperative/exit-clearance";

export function useClearanceData<T>(path: string, delay = 0) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ path: string; attempt: number; data?: T; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      memberFetch<T>(path, { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted) setState({ path, attempt, data });
      }).catch(error => {
        if (!controller.signal.aborted) setState(current => ({
          path, attempt, data: current?.path === path ? current.data : undefined,
          error: error instanceof Error ? error.message : "Unable to load clearance data.",
        }));
      });
    }, delay);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [path, attempt, delay]);
  const same = state?.path === path ? state : undefined;
  const loading = same?.attempt !== attempt;
  return {
    data: same?.data, loading, error: loading ? undefined : same?.error,
    reload: () => setAttempt(value => value + 1),
  };
}

export function useClearanceMutation(onFailure?: (error: { message: string; code?: string }) => void) {
  const identity = useRef<{ signature: string; key: string } | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string; fields: Record<string, string> }>();

  async function save(url: string, method: "POST" | "PATCH", payload: object): Promise<ClearanceActionResult | undefined> {
    if (inFlight.current) return;
    const signature = JSON.stringify([url, method, payload]);
    if (identity.current?.signature !== signature) identity.current = { signature, key: newRequestKey() };
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      return await memberFetch<ClearanceActionResult>(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestKey: identity.current.key }),
      });
    } catch (cause) {
      const failure = {
        message: cause instanceof Error ? cause.message : "Unable to save the clearance.",
        code: cause instanceof MemberApiError ? cause.payload?.code : undefined, fields: fieldErrorsFrom(cause),
      };
      setError(failure);
      onFailure?.(failure);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const reloadRequired = error?.code === "CLEARANCE_STALE" || error?.code === "CLEARANCE_READ_ONLY";
  return { save, busy, error, reloadRequired, clearError: () => setError(undefined) };
}
