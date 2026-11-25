"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type ReloadContextValue = { token: number; reload: () => void };

const ReloadContext = createContext<ReloadContextValue | null>(null);

export function PettyCashReloadProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(0);
  const reload = useCallback(() => setToken(value => value + 1), []);
  const value = useMemo(() => ({ token, reload }), [token, reload]);
  return <ReloadContext.Provider value={value}>{children}</ReloadContext.Provider>;
}

export function usePettyCashReloadToken() {
  return useContext(ReloadContext)?.token ?? 0;
}

export function PettyCashReloadButton() {
  const context = useContext(ReloadContext);
  return <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={!context}
    onClick={context?.reload} aria-label="Reload Petty Cash data">
    <RefreshCw className="size-4" aria-hidden="true" />
    <span className="hidden sm:inline">Reload</span>
  </Button>;
}
