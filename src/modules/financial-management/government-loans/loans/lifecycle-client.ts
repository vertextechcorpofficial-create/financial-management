"use client";

import { useEffect, useRef, useState } from "react";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";

export const loansApi = "/api/fm/government-loans/loans";
async function response(url: string, init?: RequestInit) {
  const result = await fetch(url, { ...init, cache: "no-store" });
  if (!result.ok) {
    const body = await result.json().catch(() => null);
    throw new Error(body?.message ?? "The request could not be completed.");
  }
  return result;
}

export function useLifecycleRead<T>(url: string | null, refresh = 0) {
  const [loaded, setLoaded] = useState<{ key: string; data?: T; error?: string }>();
  const key = url + ":" + refresh;
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void response(url, { signal: controller.signal }).then(result => result.json()).then(data => {
        if (!controller.signal.aborted) setLoaded({ key, data });
      }).catch((error: Error) => {
        if (!controller.signal.aborted) setLoaded({ key, error: error.message });
      });
    }, 150);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [url, key]);
  return loaded?.key === key ? loaded : undefined;
}

// Same reader as useLifecycleRead, but keeps the last successful payload on screen while a
// refresh is in flight and after a failed refresh. The dashboard is heavy and should not blank.
export function useRetainedLifecycleRead<T>(url: string | null, refresh = 0) {
  const [loaded, setLoaded] = useState<{ key: string; data?: T; error?: string }>();
  const [lastData, setLastData] = useState<T>();
  const key = (url ?? "") + ":" + refresh;
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void response(url, { signal: controller.signal }).then(result => result.json()).then(data => {
        if (controller.signal.aborted) return;
        setLoaded({ key, data });
        setLastData(data);
      }).catch((error: Error) => {
        if (!controller.signal.aborted) setLoaded({ key, error: error.message });
      });
    }, 150);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [url, key]);
  const current = loaded?.key === key ? loaded : undefined;
  return { data: url ? current?.data ?? lastData : undefined, error: current?.error,
    pending: Boolean(url) && Boolean(lastData) && !current?.data };
}

export function useLifecycleCommand() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const task = useRef<{ key: string; fingerprint: string } | null>(null);
  const pending = useRef(false);

  async function run(url: string, body: object | FormData, onSaved: (result: Response) => Promise<void> | void) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const multipart = body instanceof FormData;
      const fingerprint = url + JSON.stringify(multipart ? [...body.entries()].map(([name, value]) =>
        [name, typeof value === "string" ? value : [value.name, value.size, value.lastModified]]) : body);
      if (task.current?.fingerprint !== fingerprint) task.current = { key: consignmentRequestId(), fingerprint };
      const headers = new Headers({ "Idempotency-Key": task.current.key });
      if (!multipart) headers.set("Content-Type", "application/json");
      const result = await response(url, { method: "POST", headers, body: multipart ? body : JSON.stringify(body) });
      await onSaved(result);
      task.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action could not be saved.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
