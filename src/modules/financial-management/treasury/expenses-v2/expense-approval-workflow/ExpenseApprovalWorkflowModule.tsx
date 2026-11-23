"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvaluationResult } from "./types";

type Item = { expense: { id: number; doc_no: string; amount: number | string; status: string; remarks: string | null }; result: EvaluationResult | null; issue: string };
type Data = { mode: string; blocker: string; items?: Item[]; hasMore?: boolean; explanation?: string; policies?: unknown[]; assignments?: unknown[] };
export function ExpenseApprovalWorkflowModule({ section = "inbox" }: { section?: string }) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(""), [page, setPage] = useState(1), [reload, setReload] = useState(0), [selected, setSelected] = useState<Item | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/fm/treasury/expenses-v2/expense-approval-workflow/${section}?page=${page}`, { cache: "no-store", signal: controller.signal }).then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setData(payload.data); }).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [section, page, reload]);
  return <div className="mx-auto max-w-7xl space-y-5 p-5"><header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-semibold">Expense Approval Workflow</h1><p className="text-sm text-muted-foreground">{section.replaceAll("-", " ")} · integration-blocked prototype</p></div><Button variant="outline" onClick={() => setReload(value => value + 1)}>Refresh</Button></header>
    <nav aria-label="Workflow pages" className="flex flex-wrap gap-4 text-sm">{["inbox", "finance-review", "history", "settings"].map(value => <a className="underline" key={value} href={`/fm/treasury/expenses-v2/expense-approval-authority/workflow/${value}`}>{value.replaceAll("-", " ")}</a>)}</nav>
    {error ? <p role="alert" className="rounded border p-4 text-destructive">{error}</p> : !data ? <p role="status">Loading verified workflow data…</p> : <>
      <p className="rounded border border-amber-300 p-4 text-sm">Read-only: {data.blocker} Existing Expense Approval V2 remains the sole decision writer.</p>
      {data.explanation && <p className="text-sm text-muted-foreground">{data.explanation}</p>}
      {section === "settings" ? <Card><CardHeader><CardTitle>Authority readiness</CardTitle></CardHeader><CardContent><p>Effective published policies: {data.policies?.length || 0}</p><p>Your active assignments: {data.assignments?.length || 0}</p><p className="mt-3 text-sm">Routing mode, budget contract, approval ownership and downstream handoff require signed-off backend integration.</p></CardContent></Card> : <Card><CardHeader><CardTitle>{section === "history" ? "Decision history" : "Real submitted expenses"}</CardTitle></CardHeader><CardContent className="space-y-3">{!data.items?.length ? <p>No records available in this scope.</p> : data.items.map(item => <div key={item.expense.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"><div><p className="font-medium">{item.expense.doc_no || `Expense #${item.expense.id}`} · ₱{item.expense.amount}</p><p className="text-sm text-muted-foreground">{item.result?.requiredAuthorityTier || "Finance classification required"} · {item.expense.status}</p></div><Button variant="outline" onClick={() => setSelected(item)}>Review</Button></div>)}<div className="flex gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button><span className="p-2 text-sm">Page {page}</span><Button variant="outline" disabled={!data.hasMore} onClick={() => setPage(value => value + 1)}>Next</Button></div></CardContent></Card>}
      {selected && <Card><CardHeader><CardTitle>{selected.expense.doc_no} — request review</CardTitle></CardHeader><CardContent className="space-y-3"><p>{selected.expense.remarks || "No business purpose recorded."}</p><p>{selected.issue}</p>{selected.result?.checks.map(check => <p className="text-sm" key={check.code}><strong>{check.status}</strong> · {check.message}</p>)}<div className="flex flex-wrap gap-2"><Button disabled>Approve expense</Button><Button disabled variant="outline">Reject</Button><Button disabled variant="outline">Return with concern</Button></div><p className="text-xs text-muted-foreground">All decision actions are disabled, including rejection and return. No financial records are changed.</p></CardContent></Card>}
    </>}
  </div>;
}
