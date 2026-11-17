"use client";
import { useEffect } from "react";

export function usePettyCashRefresh(refresh: () => void, busy = false) {
  useEffect(() => {
    if (busy) return;
    const update = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [refresh, busy]);
}
