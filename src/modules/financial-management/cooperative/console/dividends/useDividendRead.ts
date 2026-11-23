"use client";

import { useEffect, useState } from "react";
import { memberFetch } from "../../members/client";

export function useDividendRead<T>(path: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ path: string; attempt: number; data?: T; error?: string }>();
  useEffect(() => {
    if (!path) return;
    const request = new AbortController();
    memberFetch<T>(path, { signal: request.signal }).then(data => {
      if (!request.signal.aborted) setState({ path, attempt, data });
    }).catch(error => {
      if (!request.signal.aborted) setState(previous => ({
        path, attempt, data: previous?.path === path ? previous.data : undefined,
        error: error instanceof Error ? error.message : "Year-end dividend data could not be loaded.",
      }));
    });
    return () => request.abort();
  }, [path, attempt]);
  const current = path && state?.path === path ? state : undefined;
  const loading = Boolean(path) && current?.attempt !== attempt;
  return {
    data: current?.data, loading, error: loading ? undefined : current?.error,
    reload: () => setAttempt(value => value + 1),
    replace: (data: T) => { if (path) setState({ path, attempt, data }); },
  };
}
