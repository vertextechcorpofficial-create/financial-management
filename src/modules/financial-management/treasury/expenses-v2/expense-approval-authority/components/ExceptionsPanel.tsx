"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PolicyException } from "../types";
import type { WorkspaceCommand } from "../domain/workspace";
import { Empty, Field, Notice, Status, selectClass } from "./shared";

export function ExceptionsPanel({ items, canReview, busy, command }: { items: PolicyException[]; canReview: boolean; busy: boolean; command: (value: WorkspaceCommand) => Promise<void> }) {
  const [selected, setSelected] = useState<PolicyException | null>(null), [status, setStatus] = useState<"IN_REVIEW" | "RESOLVED" | "DISMISSED">("IN_REVIEW"), [reason, setReason] = useState(""), [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL"), [page, setPage] = useState(1);
  if (!canReview) return <Empty title="Finance administration access required">Your account can evaluate authorized requests, but the company exception queue is restricted to administrators.</Empty>;
  const filtered = items.filter(i => filter === "ALL" || i.status === filter).toReversed();
  const visible = filtered.slice((page - 1) * 20, page * 20);
  return <Card><CardHeader><div className="flex flex-wrap justify-between gap-3"><div className="space-y-1"><CardTitle>Policy exceptions</CardTitle><CardDescription>Real saved evaluation findings · triage is not permission to spend</CardDescription></div><select aria-label="Filter exceptions by status" className={`${selectClass} w-44`} value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}>{["ALL", "OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"].map(s => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</select></div></CardHeader><CardContent className="space-y-4">
    <Notice>Simulation findings are labeled as simulations. Closing a finding does not override a failed policy check or change an expense approval.</Notice>
    {!filtered.length ? <Empty title="No saved findings in this view">Use Evaluate & save to persist a policy assessment and its review findings.</Empty> : <div className="divide-y rounded-lg border">{visible.map(item => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.summary}</p><p className="mt-1 text-xs text-muted-foreground">{item.evaluationId} · Company #{item.companyId} · {new Date(item.updatedAt).toLocaleString()}</p><div className="mt-2 flex flex-wrap gap-1">{item.codes.map(c => <span key={c} className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">{c.replaceAll("_", " ")}</span>)}</div>{item.resolution && <p className="mt-2 whitespace-pre-wrap text-sm">Review note: {item.resolution}</p>}</div><div className="flex items-center gap-2"><Status value={item.status} />{["OPEN", "IN_REVIEW"].includes(item.status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setSelected(item); setReason(""); setError(""); setStatus("IN_REVIEW"); }}>Review</Button>}</div></div>)}</div>}
    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{filtered.length} findings · Page {page}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page * 20 >= filtered.length} onClick={() => setPage(p => p + 1)}>Next</Button></div></div>
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !busy) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>Review policy finding</DialogTitle><DialogDescription>Record your investigation outcome. This never grants an approval exception automatically.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (!selected) return; setError(""); try { await command({ action: "RESOLVE_EXCEPTION", id: selected.id, status, reason }); setSelected(null); } catch (err) { setError((err as Error).message); } }}>
      <Field label="Review status"><select className={selectClass} value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="IN_REVIEW">In review</option><option value="RESOLVED">Resolved (documented correction)</option><option value="DISMISSED">Dismissed (documented false positive)</option></select></Field>
      <Field label="Investigation / resolution note"><Textarea required minLength={5} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></Field>{error && <Notice danger>{error}</Notice>}<Button disabled={busy}>{busy ? "Saving…" : "Save review"}</Button>
    </form></DialogContent></Dialog>
  </CardContent></Card>;
}
