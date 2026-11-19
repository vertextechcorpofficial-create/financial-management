"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { AuthorityPolicy } from "./types";

type Snapshot = { amount: string; category: string; purpose: string; policyId: string; divisionId: number | null; departmentId: number | null; status: string };
type Event = { id: string; case_id: string; revision: number; requester_id: number; actor_name: string; created_at: string; reason: string; action: string; snapshot: Snapshot };
type Item = Event & { tier: string | null; canReview: boolean; history: Event[] };
type Data = { actorId: number; companyId: number; policies: AuthorityPolicy[]; items: Item[]; approvalBlocker: string };
const endpoint = "/api/fm/treasury/expenses-v2/isolated-workflow";
export function IsolatedWorkflow({ section = "requests" }: { section?: string }) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [policyId, setPolicyId] = useState(""), [category, setCategory] = useState(""), [amount, setAmount] = useState(""), [purpose, setPurpose] = useState(""), [reason, setReason] = useState(""), [division, setDivision] = useState(""), [department, setDepartment] = useState("");
  const [editing, setEditing] = useState<Item | null>(null), [selected, setSelected] = useState<string | null>(null);
  const pending = useRef<{ signature: string; body: unknown } | null>(null);
  const refresh = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" }); const payload = await response.json();
    if (!response.ok) throw new Error(payload.error); setData(payload.data); setError("");
  }, []);
  useEffect(() => { let active = true; refresh().catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [refresh]);
  const submit = async (value: Record<string, unknown>) => {
    setBusy(true); setError(""); setNotice("");
    const signature = JSON.stringify(value);
    if (pending.current?.signature !== signature) pending.current = { signature, body: { ...value, requestKey: crypto.randomUUID() } };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending.current.body) });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status < 500) pending.current = null;
        if (response.status === 409 || response.status === 412) await refresh().catch(() => undefined);
        throw new Error(payload.error);
      }
      pending.current = null; setNotice(`Saved revision ${payload.data.revision}. No legacy expense or disbursement was created.`); setEditing(null);
      await refresh().catch(() => setError("Save confirmed, but refresh failed. Refresh before acting again."));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const policy = data?.policies.find(p => p.id === policyId);
  const detail = data?.items.find(item => item.case_id === selected);
  const items = data?.items.filter(item => section === "inbox" ? item.canReview : section === "history" ? ["REJECTED", "RETURNED"].includes(item.snapshot.status) : item.requester_id === data.actorId) || [];
  return <main className="mx-auto max-w-6xl space-y-5 p-5"><header><h1 className="text-2xl font-semibold">Isolated Expense Workflow</h1><p className="text-sm text-muted-foreground">Dedicated requests · separate from Expense Creation V2 and legacy approval records</p></header>
    <div className="flex flex-wrap gap-4 text-sm">{["requests", "inbox", "history", "settings"].map(value => <Link key={value} className="underline" href={`/fm/treasury/expenses-v2/expense-approval-authority/isolated/${value}`}>{value === "requests" ? "My requests" : value}</Link>)}<Button size="sm" variant="outline" disabled={busy} onClick={() => refresh().catch(e => setError(e.message))}>Refresh</Button></div>
    {error && <p role="alert" className="rounded border p-3 text-destructive">{error}</p>}{notice && <p role="status" className="rounded border p-3">{notice}</p>}
    {!data ? <p role="status">Loading isolated workspace…</p> : <>
      <p className="rounded border border-amber-300 p-3 text-sm">{data.approvalBlocker}</p>
      {section === "requests" && <Card><CardHeader><CardTitle>{editing ? "Correct and resubmit returned request" : "New isolated request"}</CardTitle></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void submit({ action: editing ? "RESUBMIT" : "CREATE", ...(editing ? { caseId: editing.case_id, revision: editing.revision } : {}), reason, form: { policyId, category, amount, purpose, divisionId: division ? Number(division) : null, departmentId: department ? Number(department) : null } }); }}>
        <label className="space-y-1 text-sm">Effective signed policy<select required className="h-10 w-full rounded border bg-background px-2" value={policyId} onChange={e => { setPolicyId(e.target.value); setCategory(""); }}><option value="">Choose policy</option>{data.policies.map(p => <option key={p.id} value={p.id}>{p.name} · v{p.version}</option>)}</select></label>
        <label className="space-y-1 text-sm">Category<select required className="h-10 w-full rounded border bg-background px-2" value={category} onChange={e => setCategory(e.target.value)}><option value="">Choose category</option>{policy?.rules.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}</select></label>
        <label className="space-y-1 text-sm">Amount (PHP)<Input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label className="space-y-1 text-sm">Division ID (optional)<Input type="number" min="1" value={division} onChange={e => setDivision(e.target.value)} /></label>
        <label className="space-y-1 text-sm">Department ID (optional)<Input type="number" min="1" value={department} onChange={e => setDepartment(e.target.value)} /></label>
        <label className="space-y-1 text-sm sm:col-span-2">Business purpose<Textarea required minLength={10} maxLength={2000} value={purpose} onChange={e => setPurpose(e.target.value)} /></label>
        <label className="space-y-1 text-sm sm:col-span-2">Submission reason<Textarea required minLength={5} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
        {!data.policies.length && <p className="text-sm sm:col-span-2">No effective signed policy. Configure and publish an authorized policy before submission.</p>}
        <Button disabled={busy || !policy}>{busy ? "Saving…" : editing ? "Resubmit" : "Submit isolated request"}</Button>
      </form></CardContent></Card>}
      {section === "settings" ? <Card><CardHeader><CardTitle>Isolation and readiness</CardTitle></CardHeader><CardContent className="space-y-2"><p>Company scope: #{data.companyId}, captured from the verified requester at submission; legal ownership requires Finance verification.</p><p>Storage: dedicated append-only isolated event ledger.</p><p>Legacy Expense Approval V2 cannot query these requests through its expense queue.</p><p>Effective signed policies: {data.policies.length}.</p><p>Approval readiness: blocked. Return, reject and resubmission are available to eligible officers/requesters.</p><Link className="underline" href="/fm/treasury/expenses-v2/expense-approval-authority/authority-matrix">Authority policy configuration</Link></CardContent></Card> : <Card><CardHeader><CardTitle>{section === "inbox" ? "Assigned requests" : section === "history" ? "Returned / rejected requests" : "My isolated requests"}</CardTitle></CardHeader><CardContent className="space-y-3">{!items.length && <p>No requests in this view.</p>}{items.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"><div><p className="font-medium">{item.case_id.slice(0, 8)} · ₱{item.snapshot.amount} · {item.snapshot.status}</p><p className="text-sm">{item.tier || "Policy no longer effective"} · revision {item.revision}</p></div><Button variant="outline" onClick={() => setSelected(item.case_id)}>Review / history</Button></div>)}</CardContent></Card>}
      {detail && <Card><CardHeader><CardTitle>Request details</CardTitle></CardHeader><CardContent className="space-y-4"><p>{detail.snapshot.purpose}</p><p>Company #{data.companyId} · Requester #{detail.requester_id} · Category {detail.snapshot.category}</p>
        {detail.canReview && <div className="flex flex-wrap gap-2"><Button disabled title={data.approvalBlocker}>Approve (controls unverified)</Button>{["RETURN", "REJECT"].map(action => <Button key={action} variant="outline" disabled={busy} onClick={() => { const note = window.prompt(`${action === "RETURN" ? "Concern" : "Rejection"} reason (at least 5 characters)`); if (note?.trim().length && note.trim().length >= 5) void submit({ action, caseId: detail.case_id, revision: detail.revision, reason: note }); }}>{action === "RETURN" ? "Return with concern" : "Reject"}</Button>)}</div>}
        {detail.requester_id === data.actorId && detail.snapshot.status === "RETURNED" && (section === "requests" ? <Button onClick={() => { setEditing(detail); setPolicyId(detail.snapshot.policyId); setCategory(detail.snapshot.category); setAmount(detail.snapshot.amount); setPurpose(detail.snapshot.purpose); setDivision(String(detail.snapshot.divisionId || "")); setDepartment(String(detail.snapshot.departmentId || "")); setReason(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit for resubmission</Button> : <Link className="underline" href="/fm/treasury/expenses-v2/expense-approval-authority/isolated/requests">Open My requests to correct and resubmit</Link>)}
        <h3 className="font-semibold">Append-only timeline</h3>{detail.history.map(event => <div className="rounded border p-3 text-sm" key={event.id}><p>v{event.revision} · {event.action} · {event.actor_name} · {new Date(event.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Manila)</p><p>{event.reason}</p><p>₱{event.snapshot.amount} · {event.snapshot.category}</p></div>)}
      </CardContent></Card>}
    </>}
  </main>;
}
