"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { reportPageSizes, reportSorts, type ReportKey } from "./report-options";

type View = { filters: Record<string, string>; sort: string; direction: string; size: string };
type Saved = { name: string; view: View };
const eventName = "government-loan-report-views";
const reportPrefixes: Record<ReportKey, string> = { ledger: "rl", remittances: "rr", year: "ry", audit: "ra" };
const subscribe = (listener: () => void) => {
  window.addEventListener(eventName, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(eventName, listener); window.removeEventListener("storage", listener); };
};

export function useReportView(report: ReportKey, actorId?: number) {
  const defaultSort = { ledger: "reference", remittances: "month", year: "name", audit: "at" }[report];
  const defaultDirection = report === "audit" || report === "remittances" ? "desc" : "asc";
  const defaults: View = { filters: {}, sort: defaultSort, direction: defaultDirection, size: "25" };
  const prefix = reportPrefixes[report];
  const [view, setView] = useState<View>(defaults);
  const [page, setPage] = useState(1);
  const [formRevision, setFormRevision] = useState(0);
  const skipUrlWrite = useRef(true);
  const key = actorId ? "government-loan-report-views:" + actorId + ":" + report : "";
  const stored = useSyncExternalStore(subscribe, () => {
    try { return key ? localStorage.getItem(key) ?? "[]" : "[]"; } catch { return "[]"; }
  }, () => "[]");
  let saved: Saved[] = [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) saved = parsed.filter(entry => typeof entry?.name === "string" && entry?.view?.filters &&
      Object.hasOwn(reportSorts[report], entry.view.sort) && ["asc", "desc"].includes(entry.view.direction) &&
      reportPageSizes.map(String).includes(entry.view.size) && Object.values(entry.view.filters).every(value => typeof value === "string"));
  } catch { /* Unreadable preferences have the same effect as an empty list. */ }
  const apply = (value: View) => { setView(value); setPage(1); setFormRevision(previous => previous + 1); };
  const store = (next: Saved[]) => {
    if (!key) return false;
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event(eventName));
      return true;
    } catch { return false; }
  };
  const params = new URLSearchParams({ page: String(page), size: view.size, sort: view.sort, direction: view.direction });
  for (const [field, value] of Object.entries(view.filters)) if (value) params.set(field, value);

  useEffect(() => {
    const syncFromLocation = () => {
      const url = new URLSearchParams(window.location.search);
      const reserved = new Set(["sort", "direction", "size", "page"]);
      const filters = Object.fromEntries([...url].flatMap(([key, value]) => {
        if (!key.startsWith(prefix + "_")) return [];
        const name = key.slice(prefix.length + 1);
        return reserved.has(name) ? [] : [[name, value]];
      }));
      const sort = url.get(prefix + "_sort");
      const direction = url.get(prefix + "_direction");
      const size = url.get(prefix + "_size");
      const nextPage = Number(url.get(prefix + "_page"));
      setView({
        filters,
        sort: sort && Object.hasOwn(reportSorts[report], sort) ? sort : defaultSort,
        direction: direction === "asc" || direction === "desc" ? direction : defaultDirection,
        size: reportPageSizes.map(String).includes(size ?? "") ? size! : "25",
      });
      setPage(Number.isInteger(nextPage) && nextPage > 0 ? nextPage : 1);
      setFormRevision(previous => previous + 1);
      skipUrlWrite.current = true;
    };
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [defaultDirection, defaultSort, prefix, report]);

  useEffect(() => {
    if (skipUrlWrite.current) { skipUrlWrite.current = false; return; }
    const url = new URLSearchParams(window.location.search);
    for (const name of [...url.keys()]) if (name.startsWith(prefix + "_")) url.delete(name);
    if (view.sort !== defaultSort) url.set(prefix + "_sort", view.sort);
    if (view.direction !== defaultDirection) url.set(prefix + "_direction", view.direction);
    if (view.size !== "25") url.set(prefix + "_size", view.size);
    if (page > 1) url.set(prefix + "_page", String(page));
    for (const [name, value] of Object.entries(view.filters)) if (value) url.set(prefix + "_" + name, value);
    const next = url.toString();
    const target = window.location.pathname + (next ? "?" + next : "") + window.location.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (target !== current) window.history.replaceState(window.history.state, "", target);
  }, [defaultDirection, defaultSort, page, prefix, view]);

  return { report, view, defaults, apply, page, setPage, saved, store, params, formRevision, canSave: !!key };
}

export type ReportView = ReturnType<typeof useReportView>;

export function ReportControls({ state, children }: { state: ReportView; children?: ReactNode }) {
  const [name, setName] = useState("");
  const { report, view, apply, saved, store, canSave } = state;
  function save() {
    const label = name.trim();
    if (!label) return;
    const sameName = saved.find(entry => entry.name.toLowerCase() === label.toLowerCase());
    if (!sameName && saved.length >= 20) { toast.error("Remove a saved view before adding another."); return; }
    const next = [...saved.filter(entry => entry !== sameName), { name: label, view }];
    if (store(next)) toast.success("View saved.");
    else toast.error("Unable to save this view in the browser.");
    setName("");
  }

  return <div className="space-y-2">
    <form key={state.formRevision} className="flex flex-wrap items-end gap-2" onSubmit={event => {
      event.preventDefault();
      const inputs = new FormData(event.currentTarget);
      const filters = Object.fromEntries([...inputs].filter(([key, value]) =>
        !["sort", "direction", "size"].includes(key) && typeof value === "string" && value.trim()).map(([key, value]) => [key, String(value).trim()]));
      apply({ filters, sort: String(inputs.get("sort")), direction: String(inputs.get("direction")), size: String(inputs.get("size")) });
    }}>
      {children}
      <label className="grid gap-1 text-sm">Sort by<NativeSelect aria-label="Sort by" name="sort" defaultValue={view.sort}>
        {Object.entries(reportSorts[report]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </NativeSelect></label>
      <label className="grid gap-1 text-sm">Direction<NativeSelect aria-label="Direction" name="direction" defaultValue={view.direction}>
        <option value="asc">Ascending</option><option value="desc">Descending</option>
      </NativeSelect></label>
      <label className="grid gap-1 text-sm">Rows per page<NativeSelect aria-label="Rows per page" name="size" defaultValue={view.size}>
        {reportPageSizes.map(size => <option key={size}>{size}</option>)}
      </NativeSelect></label>
      <Button variant="outline" type="submit">Apply filters</Button>
      <Button variant="ghost" type="button" onClick={() => apply(state.defaults)}>Reset filters</Button>
    </form>
    {canSave && <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={report + "-view-name"}>Saved view name</label>
      <Input id={report + "-view-name"} value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="Name current view" className="w-44" />
      <Button type="button" variant="outline" size="sm" disabled={!name.trim()} onClick={save}>Save view</Button>
      {saved.map(entry => <span key={entry.name} className="inline-flex items-center gap-1 rounded-md border px-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => { apply(entry.view); toast.success("View applied."); }}>{entry.name}</Button>
        <Button type="button" variant="ghost" size="sm" aria-label={"Remove saved view " + entry.name}
          onClick={() => {
            if (store(saved.filter(view => view !== entry))) toast.success("View removed.");
            else toast.error("Unable to remove this view.");
          }}>×</Button>
      </span>)}
    </div>}
  </div>;
}

export function CopyReport({ url, filename, countLabel = "records" }: { url: string; filename: string; countLabel?: string }) {
  const [download, setDownload] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download); }, [download]);
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <Button type="button" variant="outline" disabled={busy} onClick={async () => {
      setBusy(true); setDownload("");
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          const error = await response.json().catch(() => null);
          throw new Error(error?.message ?? "Unable to load the CSV.");
        }
        const count = response.headers.get("X-Report-Row-Count") ?? "All";
        const content = await response.text();
        try {
          await navigator.clipboard.writeText(content);
          toast.success("Copied " + count + " " + countLabel + " as CSV.");
        } catch {
          setDownload(URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" })));
          toast.info("Clipboard unavailable. Download the CSV.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to copy the report.");
      } finally { setBusy(false); }
    }}>{busy ? "Preparing CSV…" : "Copy as CSV"}</Button>
    {download && <a className="underline" href={download} download={filename}>Download CSV</a>}
  </div>;
}

export function ReportHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>;
}

export function ReportMetric({ label, value, detail, tone }: {
  label: string; value: string; detail?: string; tone?: "warning" | "critical" | "accent";
}) {
  return <div className={cn("rounded-lg border bg-card p-3", tone === "warning" && "border-amber-300/70 dark:border-amber-900",
    tone === "critical" && "border-destructive/40 bg-destructive/5", tone === "accent" && "border-primary/40 bg-primary/5")}>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
  </div>;
}
