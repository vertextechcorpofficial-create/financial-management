"use client";

import { useEffect, useState } from "react";
import { History, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { AuthorityRevision } from "../types";
import { authorityApi } from "../services/authorityApi";
import { Empty, Notice } from "./shared";

type EventRow = Omit<AuthorityRevision, "workspace" | "request_hash" | "request_id">;
export function AuthorityAuditHistory({ revision, canView }: { revision: number; canView: boolean }) {
  const [items, setItems] = useState<EventRow[]>([]), [page, setPage] = useState(1), [search, setSearch] = useState("");
  const [more, setMore] = useState(false), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      authorityApi<{ items: EventRow[]; hasMore: boolean }>(`history?${new URLSearchParams({ page: String(page), search })}`, undefined, controller.signal)
        .then(data => { setItems(data.items); setMore(data.hasMore); setError(""); })
        .catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [page, search, revision, canView]);
  if (!canView) return <Empty title="Audit access restricted">Full configuration and evaluation history is available to verified ERP administrators.</Empty>;
  return <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><CardTitle>Audit history</CardTitle><CardDescription>Append-only revisions · server timestamps · complete before / after evidence</CardDescription></div><Button size="sm" variant="outline" disabled={!items.length} onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(items, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `authority-audit-page-${page}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download />Export this page</Button></div></CardHeader><CardContent className="space-y-4">
    <Input aria-label="Search audit actor" placeholder="Search by actor name…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
    {error && <Notice danger>{error}</Notice>}{loading ? <p role="status" className="text-sm text-muted-foreground">Loading history…</p> : !items.length ? <Empty title="No audit events">Saved policy, assignment, evaluation, and review actions will appear here.</Empty> : <ol className="divide-y rounded-lg border">{items.map(row => <li key={row.id} className="p-4"><div className="flex items-start gap-3"><div className="mt-0.5 rounded-full bg-muted p-2"><History className="size-4 text-muted-foreground" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold">{row.event.action.replaceAll("_", " ")}</p><span className="text-xs text-muted-foreground">Revision {row.revision}</span></div><p className="mt-1 text-xs text-muted-foreground">{row.actor_name} · {new Date(row.created_at).toLocaleString()} · Company #{row.company_id}</p><p className="mt-2 whitespace-pre-wrap text-sm">{row.event.reason}</p><details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-primary">View immutable event snapshot</summary><pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify({ before: row.event.before, after: row.event.after }, null, 2)}</pre></details></div></div></li>)}</ol>}
    <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Page {page} · 20 events per page</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={!more || loading} onClick={() => setPage(p => p + 1)}>Next</Button></div></div>
  </CardContent></Card>;
}
