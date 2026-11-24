"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { voucherApi } from "../providers/vouchers.api";
import { onboardingRequestId } from "../providers/onboarding.api";
import { useCachedRead } from "./useCachedRead";
import { PREVIEW_RETRY_DELAYS, retryablePreviewError } from "../utils/voucherPreview";
import type { VoucherInput, VoucherPreview } from "../voucher-types";

export function useVoucherRead<T>(path: string | null, delay = 0) {
  const read = useCachedRead<T>({
    namespace: "vouchers",
    path,
    delay,
    load: voucherApi,
    errorMessage: "Unable to load vouchers.",
  });
  return { ...read, data: read.data ?? null, error: read.error ?? null };
}
export function useVoucherPreview(input: VoucherInput, enabled = true, fundVersion?: number) {
  const serialized = JSON.stringify(input); const [revision, setRevision] = useState(0);
  const key = JSON.stringify([serialized, revision, fundVersion]);
  const [result, setResult] = useState<{ key: string; data: VoucherPreview | null; error: Error | null; retrying: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let attempt = 0, timer = 0;
    function run() {
      voucherApi<VoucherPreview>("vouchers/preview", { method: "POST", body: serialized, signal: controller.signal }).then(data => { if (!controller.signal.aborted) setResult({ key, data, error: null, retrying: false }); })
        .catch(cause => {
          if (controller.signal.aborted) return;
          const error = cause instanceof Error ? cause : new Error("Unable to preview calculations.");
          if (retryablePreviewError(error) && attempt < PREVIEW_RETRY_DELAYS.length) {
            const delay = PREVIEW_RETRY_DELAYS[attempt++];
            setResult({ key, data: null, error: null, retrying: true });
            timer = window.setTimeout(run, delay);
            return;
          }
          setResult({ key, data: null, error, retrying: false });
        });
    }
    timer = window.setTimeout(run, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [enabled, serialized, key]);
  const resolved = enabled && result?.key === key;
  return { data: resolved ? result.data : null, error: resolved ? result.error : null, retrying: resolved && result.retrying, loading: enabled && result?.key !== key, refresh: () => setRevision(value => value + 1) };
}
export function useVoucherCommand() {
  const active = useRef(false), identity = useRef<{ fingerprint: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<Error | null>(null);
  async function run<T>(path: string, method: "POST" | "PUT", payload: object): Promise<T | null> {
    if (active.current) return null; active.current = true; setBusy(true); setError(null);
    try {
      const fingerprint = JSON.stringify([path, method, payload]);
      if (identity.current?.fingerprint !== fingerprint) identity.current = { fingerprint, key: onboardingRequestId() };
      const result = await voucherApi<T>(path, { method, body: JSON.stringify({ ...payload, requestId: identity.current.key }) }); identity.current = null; return result;
    } catch (cause) { setError(cause instanceof Error ? cause : new Error("Unable to save voucher.")); return null; }
    finally { active.current = false; setBusy(false); }
  }
  const clearError = useCallback(() => setError(null), []);
  return { run, busy, error, clearError };
}
