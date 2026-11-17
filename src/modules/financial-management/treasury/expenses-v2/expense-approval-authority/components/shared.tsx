"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ReferenceOption } from "../types";
import { authorityApi } from "../services/authorityApi";

export const selectClass = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">{label}{children}{hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}</label>;
}
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return <div role={danger ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${danger ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-amber-500/30 bg-amber-500/5 text-foreground"}`}><AlertCircle className="mt-0.5 size-4 shrink-0" /><div>{children}</div></div>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-5 py-12 text-center"><Inbox className="mb-2 size-8 text-muted-foreground/60" /><h3 className="font-semibold">{title}</h3><p className="max-w-lg text-sm text-muted-foreground">{children}</p></div>;
}
export function Status({ value }: { value: string }) {
  const positive = ["PUBLISHED", "ACTIVE", "PASS", "RESOLVED", "ELIGIBLE"].includes(value);
  const negative = ["BLOCKED", "FAIL", "REVOKED"].includes(value);
  return <Badge variant="outline" className={`whitespace-nowrap text-[11px] ${positive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : negative ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}>{value.replaceAll("_", " ")}</Badge>;
}
export function money(value: string | null) {
  if (value === null) return "Not authorized";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(Number(value));
}
export function utcInput(date = new Date()) { return date.toISOString().slice(0, 16); }
export function fromUtcInput(value: string) { return new Date(`${value}:00Z`).toISOString(); }
export function ReferencePicker({ label, kind, value, onChange, companyId, required = false }: {
  label: string; kind: string; value: number | null; onChange: (id: number | null) => void; companyId?: number; required?: boolean;
}) {
  const id = useId();
  const [search, setSearch] = useState(""), [page, setPage] = useState(1), [items, setItems] = useState<ReferenceOption[]>([]);
  const [hasMore, setHasMore] = useState(false), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ReferenceOption | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const query = new URLSearchParams({ kind, search, page: String(page), ...(companyId ? { companyId: String(companyId) } : {}) });
      authorityApi<{ items: ReferenceOption[]; hasMore: boolean }>(`references?${query}`, undefined, controller.signal)
        .then(data => { setItems(data.items); setHasMore(data.hasMore); setError(""); })
        .catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, search, page, companyId]);
  return <div className="space-y-1.5"><label htmlFor={id} className="text-sm font-medium">{label}</label>
    <Input aria-label={`Search ${label}`} placeholder={`Search ${label.toLowerCase()}…`} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
    <select id={id} className={selectClass} required={required} value={value || ""} onChange={e => {
      const next = Number(e.target.value) || null; onChange(next); setSelected(items.find(i => i.id === next) || null);
    }}><option value="">{required ? "Select…" : "Not specified / company-wide"}</option>
      {value && !items.some(i => i.id === value) && <option value={value}>{selected?.id === value ? selected.name : `Selected #${value}`}</option>}
      {items.map(item => <option key={item.id} value={item.id}>{item.name} (#{item.id})</option>)}
    </select>
    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{loading ? "Loading…" : `Page ${page}`}</span><div className="flex gap-1">
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Previous ${label} page`} disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}><ChevronLeft /></Button>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Next ${label} page`} disabled={!hasMore || loading} onClick={() => setPage(p => p + 1)}><ChevronRight /></Button>
    </div></div>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
