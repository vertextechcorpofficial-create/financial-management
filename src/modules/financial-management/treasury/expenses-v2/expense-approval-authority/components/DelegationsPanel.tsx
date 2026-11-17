"use client";

import { useState } from "react";
import { Plus, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TIERS, TIER_LABELS, type AuthorityTier, type Delegation } from "../types";
import type { WorkspaceCommand } from "../domain/workspace";
import { Empty, Field, Notice, ReferencePicker, Status, selectClass, utcInput, fromUtcInput } from "./shared";

export function DelegationsPanel({ delegations, companyId, canManage, busy, command }: {
  delegations: Delegation[]; companyId: number | null; canManage: boolean; busy: boolean; command: (value: WorkspaceCommand) => Promise<void>;
}) {
  const [open, setOpen] = useState(false), [revoking, setRevoking] = useState<Delegation | null>(null), [error, setError] = useState("");
  const [userId, setUserId] = useState<number | null>(null), [divisionId, setDivisionId] = useState<number | null>(null), [departmentId, setDepartmentId] = useState<number | null>(null);
  const [tier, setTier] = useState<AuthorityTier>("DEPARTMENT_HEAD"), [start, setStart] = useState(utcInput()), [end, setEnd] = useState(""), [reason, setReason] = useState("");
  const rows = delegations.filter(d => !companyId || d.companyId === companyId);
  return <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><CardTitle>Authority assignments</CardTitle><CardDescription>Named officers · organizational scope · effective dates · prospective revocation</CardDescription></div>
    {canManage && <Button size="sm" disabled={busy || !companyId} onClick={() => { setOpen(true); setRevoking(null); setReason(""); setError(""); setUserId(null); setDivisionId(null); setDepartmentId(null); }}><Plus />Assign authority</Button>}</div></CardHeader>
    <CardContent className="space-y-4"><Notice>These are spending-authority assignments, not temporary substitute approvers. Overlapping authority at the same tier and scope is rejected. Assignments do not grant access to the existing approval screen.</Notice>
      {!rows.length ? <Empty title="No authority assignments">Select a company policy, then assign authorized officers. Existing division approval tiers are not automatically imported.</Empty> : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[800px] text-sm"><caption className="sr-only">Company authority assignments</caption><thead className="bg-muted/60"><tr>{["Officer", "Authority", "Scope", "Validity (UTC)", "Status", ""].map((h, i) => <th key={i} className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
        <tbody className="divide-y">{rows.map(d => <tr key={d.id}><td className="px-3 py-3 font-medium"><div className="flex items-center gap-2"><UserRoundCheck className="size-4 text-muted-foreground" />{d.userName}</div><span className="text-xs text-muted-foreground">User #{d.userId}</span></td><td className="px-3 py-3">{TIER_LABELS[d.tier]}</td><td className="px-3 py-3 text-xs">Company #{d.companyId}<br />{d.divisionId ? `Division #${d.divisionId}` : "All divisions"}<br />{d.departmentId ? `Department #${d.departmentId}` : "All departments"}</td><td className="px-3 py-3 text-xs">{d.startsAt.replace("T", " ").slice(0, 16)}<br />{d.endsAt ? `Until ${d.endsAt.replace("T", " ").slice(0, 16)}` : "No scheduled end"}</td><td className="px-3 py-3"><Status value={d.status} />{d.status === "ACTIVE" && <div className="mt-1 text-xs text-muted-foreground">{d.startsAt > new Date().toISOString() ? "Scheduled" : d.endsAt && d.endsAt <= new Date().toISOString() ? "Expired" : "Effective"}</div>}</td><td className="px-3 py-3">{canManage && d.status === "ACTIVE" && <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setRevoking(d); setOpen(true); setReason(""); setError(""); }}>Revoke</Button>}</td></tr>)}</tbody></table></div>}
    </CardContent><Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{revoking ? "Revoke authority" : "Assign spending authority"}</DialogTitle><DialogDescription>{revoking ? "Historical decisions remain unchanged." : `Company #${companyId}. Assignment is effective only within its specified scope and dates.`}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setError(""); try {
        if (revoking) await command({ action: "REVOKE_DELEGATION", id: revoking.id, reason });
        else { if (!companyId || !userId) throw new Error("Select an active officer in this company."); await command({ action: "CREATE_DELEGATION", companyId, userId, tier, divisionId, departmentId, startsAt: fromUtcInput(start), endsAt: end ? fromUtcInput(end) : null, reason }); }
        setOpen(false);
      } catch (err) { setError((err as Error).message); } }}>
        {!revoking && <><ReferencePicker key={companyId} label="Officer" kind="users" companyId={companyId || undefined} value={userId} onChange={setUserId} required />
          <Field label="Authority tier"><select className={selectClass} value={tier} onChange={e => setTier(e.target.value as AuthorityTier)}>{TIERS.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}</select></Field>
          <div className="grid gap-4 sm:grid-cols-2"><ReferencePicker label="Division" kind="divisions" value={divisionId} onChange={id => { setDivisionId(id); setDepartmentId(null); }} /><ReferencePicker label="Department" kind="departments" value={departmentId} onChange={setDepartmentId} required={tier === "DEPARTMENT_HEAD"} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Starts (UTC)"><Input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} /></Field><Field label="Ends (UTC, optional)"><Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></Field></div></>}
        <Field label="Authorization / revocation reason"><Textarea required minLength={5} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></Field>
        {error && <Notice danger>{error}</Notice>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy} variant={revoking ? "destructive" : "default"}>{busy ? "Saving…" : revoking ? "Confirm revocation" : "Save assignment"}</Button></div>
      </form></DialogContent></Dialog></Card>;
}
