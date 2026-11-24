"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePettyCashReloadToken } from "../components/PettyCashReload";
import { clearCachedRead, getCachedRead, readCacheKey, setCachedRead } from "../utils/readCache";
import { sameResource } from "../utils/readResource";
import { isUnauthorized } from "../utils/sessionExpiry";

type Load<T> = (path: string, init?: RequestInit) => Promise<T>;
type State<T> = { path: string; key: string; data?: T; error?: Error; updatedAt?: number };

export function useCachedRead<T>({
  namespace,
  path,
  load,
  errorMessage,
  delay = 0,
  ignoreUnauthorized = false,
}: {
  namespace: string;
  path: string | null;
  load: Load<T>;
  errorMessage: string;
  delay?: number;
  ignoreUnauthorized?: boolean;
}) {
  const reloadToken = usePettyCashReloadToken();
  const cacheKey = path ? readCacheKey(namespace, path) : null;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<State<T> | null>(null);
  const key = JSON.stringify([path, revision, reloadToken]);
  const seenToken = useRef(reloadToken);

  useEffect(() => {
    const forced = seenToken.current !== reloadToken;
    seenToken.current = reloadToken;
    if (!path || !cacheKey) return;
    const cached = getCachedRead<T>(cacheKey);
    if (cached && !forced) return;
    if (forced) clearCachedRead(cacheKey);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      Promise.resolve().then(() => load(path, { signal: controller.signal })).then(data => {
        if (controller.signal.aborted) return;
        setCachedRead(cacheKey, data);
        setResult({ path, key, data, updatedAt: Date.now() });
      }).catch(cause => {
        if (controller.signal.aborted || (ignoreUnauthorized && isUnauthorized(cause))) return;
        setResult(previous => ({
          path,
          key,
          data: previous?.path === path ? previous.data : undefined,
          updatedAt: previous?.path === path ? previous.updatedAt : undefined,
          error: cause instanceof Error ? cause : new Error(errorMessage),
        }));
      });
    }, delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [path, cacheKey, key, delay, load, errorMessage, ignoreUnauthorized, reloadToken]);

  const exact = result && result.path === path ? result : null;
  const cached = cacheKey ? getCachedRead<T>(cacheKey) : undefined;
  const active = exact ?? (cached && path ? { path, key, data: cached.data, updatedAt: cached.updatedAt } : null)
    ?? (result && path && sameResource(result.path, path) ? result : null);
  const current = active?.key === key;

  return {
    data: active?.data,
    updatedAt: active?.updatedAt ?? null,
    error: exact?.error,
    loading: path !== null && !active,
    refreshing: path !== null && Boolean(active) && !current,
    refresh: useCallback(() => {
      if (cacheKey) clearCachedRead(cacheKey);
      setRevision(value => value + 1);
    }, [cacheKey]),
  };
}
