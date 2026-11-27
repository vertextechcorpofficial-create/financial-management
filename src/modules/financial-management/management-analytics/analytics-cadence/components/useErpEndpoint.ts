"use client";

import { useEffect, useState } from "react";

export interface ErpProxyState<T> {
  loading: boolean;
  available: boolean;
  sample: boolean;
  forbidden: boolean;
  error: string | null;
  data: T | null;
}

export function useErpEndpoint<T>(
  endpoint: string | null,
  params?: Record<string, string | number | boolean | null | undefined>,
): ErpProxyState<T> {
  const qs = (() => {
    if (!endpoint) return "";
    const sp = new URLSearchParams();
    sp.set("endpoint", endpoint);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
      }
    }
    return sp.toString();
  })();

  const [result, setResult] = useState<{
    key: string;
    available: boolean;
    sample: boolean;
    forbidden: boolean;
    error: string | null;
    data: T | null;
  } | null>(null);

  useEffect(() => {
    if (!qs) return;
    let cancelled = false;
    fetch(`/api/fm/management-analytics/erp-proxy?${qs}`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          success?: boolean;
          available?: boolean;
          sample?: boolean;
          code?: string;
          error?: string;
          data?: T | null;
        } | null;
        if (cancelled) return;
        if (res.status === 403 || body?.code === "FORBIDDEN") {
          setResult({
            key: qs,
            available: true,
            sample: false,
            forbidden: true,
            error: body?.error || "Access restricted for this analytics endpoint.",
            data: null,
          });
          return;
        }
        if (!res.ok || !body?.success) {
          setResult({
            key: qs,
            available: false,
            sample: false,
            forbidden: false,
            error: body?.error || `Request failed (${res.status})`,
            data: null,
          });
          return;
        }
        setResult({
          key: qs,
          available: body.available !== false,
          sample: Boolean(body.sample),
          forbidden: false,
          error: null,
          data: (body.data ?? null) as T | null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            key: qs,
            available: false,
            sample: false,
            forbidden: false,
            error: "Could not reach ERP_SERVER.",
            data: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qs]);

  if (!qs) {
    return { loading: false, available: false, sample: false, forbidden: false, error: null, data: null };
  }

  const matched = result && result.key === qs ? result : null;
  if (!matched) {
    return { loading: true, available: true, sample: false, forbidden: false, error: null, data: null };
  }
  return {
    loading: false,
    available: matched.available,
    sample: matched.sample,
    forbidden: matched.forbidden,
    error: matched.error,
    data: matched.data,
  };
}
