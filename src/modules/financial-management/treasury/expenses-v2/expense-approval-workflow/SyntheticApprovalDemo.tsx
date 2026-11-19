"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DEMO_ACTORS, type DemoActor, type DemoRequest } from "./demoEngine";
type Item = { snapshot: DemoRequest; revision: number; tier: string; history: { revision: number; action: string; reason: string; demo_actor: string; real_actor_id: number; created_at: string }[] };
export function SyntheticApprovalDemo() {
  const [items, setItems] = useState<Item[] | null>(null), [actor, setActor] = useState<DemoActor>("CFO"), [reason, setReason] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("35000.00"), [evidence, setEvidence] = useState(true), [funds, setFunds] = useState(true);
  const pending = useRef<{ signature: string; body: unknown } | null>(null);
  const load = useCallback(async () => { const response = await fetch("/api/fm/treasury/expenses-v2/isolated-demo", { cache: "no-store" }); const payload = await response.json(); if (!response.ok) throw Error(payload.error); setItems(payload.data.items); setError(""); }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  const act = async (item: Item, action: string) => {
    setBusy(true); setError(""); setNotice("");
    const value = { caseId: item.snapshot.id, revision: item.revision, actor, action, reason, ...(action === "RESUBMIT" ? { correction: { amount, evidence, funds } } : {}) };
    const signature = JSON.stringify(value);
    if (pending.current?.signature !== signature) pending.current = { signature, body: { ...value, requestKey: crypto.randomUUID() } };
    try {
      const response = await fetch("/api/fm/treasury/expenses-v2/isolated-demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending.current.body) }); const payload = await response.json();
      if (!response.ok) { if (response.status < 500) pending.current = null; if (response.status === 409) await load(); throw Error(payload.error); }
      pending.current = null; setNotice(`${action === "RETURN" ? "Returned" : action === "APPROVE" ? "Approved" : action === "REJECT" ? "Rejected" : "Resubmitted"} · revision ${payload.data.revision}.`); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-6xl space-y-5 p-5"><h1 className="text-2xl font-semibold">Expense Approval Workflow</h1>
    <p className="text-sm text-muted-foreground">Choose the required review role, enter a decision reason, then approve, reject or return a request. Returned requests can be corrected using the Requester role.</p>
    <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm">Review role<select className="h-10 w-full rounded border bg-background px-3" value={actor} onChange={e => setActor(e.target.value as DemoActor)}>{DEMO_ACTORS.map(role => <option key={role} value={role}>{role === "DEMO_REQUESTER" ? "Requester" : role.replaceAll("_", " ")}</option>)}</select></label><label className="space-y-2 text-sm">Decision reason<Textarea value={reason} minLength={5} maxLength={1000} onChange={e => setReason(e.target.value)} /></label></div>
    <Button disabled={busy} variant="outline" onClick={() => load().catch(e => setError(e.message))}>Refresh</Button>{error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!items ? <p>Loading requests…</p> : items.map(item => <Card key={item.snapshot.id}><CardHeader><CardTitle>{item.snapshot.title.replace(/^DEMO — /, "")}</CardTitle></CardHeader><CardContent className="space-y-4"><p>₱{item.snapshot.amount} · Required authority: {item.tier.replaceAll("_", " ")} · {item.snapshot.status} · revision {item.revision}</p><p className="text-sm">Documents: {item.snapshot.evidence ? "Complete" : "Missing"} · Funds: {item.snapshot.funds ? "Verified" : "Unverified"}</p>
      {item.snapshot.status === "SUBMITTED" && <div className="flex flex-wrap gap-2">{["APPROVE", "REJECT", "RETURN"].map(action => <Button key={action} variant={action === "APPROVE" ? "default" : "outline"} disabled={busy || reason.trim().length < 5} onClick={() => void act(item, action)}>{action === "APPROVE" ? "Approve" : action === "RETURN" ? "Return with concern" : "Reject"}</Button>)}</div>}
      {item.snapshot.status === "RETURNED" && <div className="space-y-3 rounded border p-3"><p>Select Requester to correct and resubmit.</p><label className="block text-sm">Corrected amount<Input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={evidence} onChange={e => setEvidence(e.target.checked)} />Documents complete</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={funds} onChange={e => setFunds(e.target.checked)} />Funds verified</label><Button disabled={busy || reason.trim().length < 5} onClick={() => void act(item, "RESUBMIT")}>Resubmit</Button></div>}
      <details><summary className="cursor-pointer text-sm font-medium">Decision history</summary>{!item.history.length && <p className="mt-2 text-sm">No decision yet.</p>}{item.history.map(event => <p className="mt-2 border-t pt-2 text-sm" key={event.revision}>v{event.revision} · {event.action} · {event.demo_actor === "DEMO_REQUESTER" ? "Requester" : event.demo_actor.replaceAll("_", " ")} · User #{event.real_actor_id} · {new Date(event.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} Manila<br />{event.reason}</p>)}</details>
    </CardContent></Card>)}
  </main>;
}
