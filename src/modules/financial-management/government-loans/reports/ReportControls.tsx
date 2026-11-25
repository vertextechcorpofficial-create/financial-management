"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { reportPageSizes, reportSorts, type ReportKey } from "./report-options";

type View = { filters: Record<string, string>; sort: string; direction: string; size: string };
type Saved = { name: string; view: View };
const eventName = "government-loan-report-views";
const subscribe = (listener: () => void) => {
  window.addEventListener(eventName, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(eventName, listener); window.removeEventListener("storage", listener); };
};

export function useReportView(report: ReportKey, actorId?: number) {
  const defaultSort = { ledger: "reference", remittances: "month", year: "name", audit: "at" }[report];
  const direction = report === "audit" || report === "remittances" ? "desc" : "asc";
  const defaults: View = { filters: {}, sort: defaultSort, direction, size: "25" };
  const [view, setView] = useState<View>(defaults);
  const [page, setPage] = useState(1);
  const [formRevision, setFormRevision] = useState(0);
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
  return { report, view, defaults, apply, page, setPage, saved, store, params, formRevision, canSave: !!key };
}

export type ReportView = ReturnType<typeof useReportView>;

export function ReportControls({ state, children }: { state: ReportView; children?: ReactNode }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const { report, view, apply, saved, store, canSave } = state;
  function save() {
    const label = name.trim();
    if (!label) return;
    const sameName = saved.find(entry => entry.name.toLowerCase() === label.toLowerCase());
    if (!sameName && saved.length >= 20) { setMessage("Remove a saved view before adding another."); return; }
    const next = [...saved.filter(entry => entry !== sameName), { name: label, view }];
    setMessage(store(next) ? "View saved." : "Unable to save this view in the browser.");
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
        <Button type="button" variant="ghost" size="sm" onClick={() => { apply(entry.view); setMessage("View applied."); }}>{entry.name}</Button>
        <Button type="button" variant="ghost" size="sm" aria-label={"Remove saved view " + entry.name}
          onClick={() => setMessage(store(saved.filter(view => view !== entry)) ? "View removed." : "Unable to remove this view.")}>×</Button>
      </span>)}
      {message && <span role="status" className="text-sm">{message}</span>}
    </div>}
  </div>;
}

export function CopyReport({ url, filename, countLabel = "records" }: { url: string; filename: string; countLabel?: string }) {
  const [message, setMessage] = useState("");
  const [download, setDownload] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download); }, [download]);
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <Button type="button" variant="outline" disabled={busy} onClick={async () => {
      setBusy(true); setMessage(""); setDownload("");
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
          setMessage("Copied " + count + " " + countLabel + " as CSV.");
        } catch {
          setDownload(URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" })));
          setMessage("Clipboard unavailable. Download the CSV.");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to copy the report.");
      } finally { setBusy(false); }
    }}>{busy ? "Preparing CSV…" : "Copy as CSV"}</Button>
    {download && <a className="underline" href={download} download={filename}>Download CSV</a>}
    {message && <span role="status">{message}</span>}
  </div>;
}
