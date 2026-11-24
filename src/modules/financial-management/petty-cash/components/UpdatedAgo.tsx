"use client";
import { useEffect, useState } from "react";

function relative(at: number, now: number) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

export function UpdatedAgo({ at }: { at: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!at) return null;
  return <span className="text-xs text-muted-foreground">{`Updated ${relative(at, now)}`}</span>;
}
