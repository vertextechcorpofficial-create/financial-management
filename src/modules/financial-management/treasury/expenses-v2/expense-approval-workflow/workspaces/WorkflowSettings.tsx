"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TIER_LABELS, TIERS } from "../types";
import { PROPOSED_RULES } from "../policy-seed";
import type { AuthorityPolicy, AuthorityRule } from "../types";
import type { OperationsData } from "../operationsTypes";
import { createRequestKey } from "../utils/requestKey";

const money = (value: string | null) => value === null ? "Not delegated" : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
export function WorkflowSettings({ data, panel, onSaved }: { data: OperationsData; panel: string; onSaved: () => void }) {
  const [editing, setEditing] = useState<AuthorityPolicy | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ signature: string; requestId: string } | null>(null);
  const submit = async (command: object) => {
    setBusy(true); setError("");
    const signature = JSON.stringify({ command, expectedRevision: data.revision });
    if (pending.current?.signature !== signature) pending.current = { signature, requestId: createRequestKey() };
    try {
      const response = await fetch("/api/fm/treasury/expenses-v2/authority-operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, expectedRevision: data.revision, requestId: pending.current.requestId }) });
      const payload = await response.json();
      if (!response.ok) { if (response.status < 500) pending.current = null; throw Error(payload.error || "Save failed."); }
      pending.current = null; setEditing(null); setReason(""); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Change not confirmed. Retry the same intent."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4">
    {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error} Your inputs have been preserved. On conflict, refresh and deliberately review the latest configuration; no automatic replay occurs.</p>}
    {panel === "matrix" && <>
      <div><h3 className="font-semibold">Authority matrix</h3><p className="mt-1 text-sm text-muted-foreground">One approved configuration per applicable scope—not a new policy for each expense. Monetary limits alone do not grant signing authority.</p></div>
      {data.policies.map(policy => <section key={policy.id} className="space-y-3 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-medium">{policy.name} · v{policy.version}</h4><p className="text-xs text-muted-foreground">Company #{policy.companyId} · {policy.effectiveFrom ? `Effective ${policy.effectiveFrom}` : "No effective date"}</p></div><div className="flex gap-2"><Badge variant="outline">{policy.status.replaceAll("_", " ")}</Badge>{data.capabilities.editPolicies && policy.status === "DRAFT" && <Button variant="outline" size="sm" disabled={busy} onClick={() => { setEditing(structuredClone(policy)); setReason(""); }}>Edit draft</Button>}</div></div><Matrix rules={policy.rules} /></section>)}
      {!data.policies.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No scoped policy is available to this account. Reference values below are proposed, unsigned and not operational.</p>}
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Proposed memo reference · not active authority</summary><p className="my-3 text-sm text-muted-foreground">These values are reference material, not published enforcement. Management must ratify the matrix, resolve conflicts and approve routing.</p><Matrix rules={PROPOSED_RULES} /></details>
      {editing && <form className="space-y-4 rounded-xl border p-4" onSubmit={e => { e.preventDefault(); void submit({ action: "UPDATE_POLICY", id: editing.id, name: editing.name, rules: editing.rules, reason }); }}><h3 className="font-semibold">Edit policy draft</h3><label className="block text-sm">Policy name<Input required value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label><div className="max-h-96 space-y-3 overflow-auto">{editing.rules.map((rule, index) => <div key={rule.code} className="rounded border p-3"><h4 className="text-sm font-medium">{rule.name}</h4><div className="mt-2 grid gap-2 sm:grid-cols-3">{(["departmentHead", "generalManager", "cfo"] as const).map(field => <label key={field} className="text-xs">{field === "departmentHead" ? "DH ceiling (blank = no DH)" : field === "generalManager" ? "GM ceiling" : "CFO ceiling"}<Input inputMode="decimal" value={rule[field] || ""} onChange={e => { const rules = structuredClone(editing.rules); if (field === "departmentHead") rules[index].departmentHead = e.target.value || null; else rules[index][field] = e.target.value; setEditing({ ...editing, rules }); }} /></label>)}</div></div>)}</div><label className="block text-sm">Change reason<Textarea required minLength={10} value={reason} onChange={e => setReason(e.target.value)} /></label><div className="flex gap-2"><Button disabled={busy || reason.trim().length < 10}>{busy ? "Saving…" : "Save draft revision"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button></div></form>}
    </>}
    {panel === "officers" && <>
      <h3 className="font-semibold">Scoped officer assignments</h3><p className="text-sm text-muted-foreground">Technical administrators, Finance reviewers and auditors do not automatically become spending approvers.</p>
      <div className="overflow-auto rounded-xl border"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-muted/50"><tr>{["Officer", "Authority", "Scope", "Valid from", ""].map((h, i) => <th key={i} className="p-3 font-medium">{h}</th>)}</tr></thead><tbody>{data.assignments.map(a => <tr className="border-t" key={a.id}><td className="p-3">{a.userName}</td><td className="p-3">{TIER_LABELS[a.tier]}</td><td className="p-3">Company #{a.companyId} · Division {a.divisionId ?? "All"} · Department {a.departmentId ?? "All"}</td><td className="p-3">{a.startsAt}</td><td className="p-3">{data.capabilities.manageOfficers && <Button size="sm" variant="outline" disabled={busy} onClick={() => { const value = window.prompt("Reason for revoking this assignment (at least 10 characters)"); if (value && value.trim().length >= 10) void submit({ action: "REVOKE_DELEGATION", id: a.id, reason: value }); }}>Revoke</Button>}</td></tr>)}{!data.assignments.length && <tr><td colSpan={5} className="p-6 text-muted-foreground">No active assignments are available in your authorized scope.</td></tr>}</tbody></table></div>
      {data.capabilities.manageOfficers && <form className="space-y-3 rounded-xl border p-4" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); const number = (key: string) => form.get(key) ? Number(form.get(key)) : null; void submit({ action: "CREATE_DELEGATION", companyId: number("companyId"), userId: number("userId"), tier: form.get("tier"), divisionId: number("divisionId"), departmentId: number("departmentId"), startsAt: new Date(String(form.get("startsAt"))).toISOString(), endsAt: null, reason: form.get("reason") }); }}><h4 className="font-medium">Assign an officer</h4><p className="text-xs text-muted-foreground">The server validates active ERP identity, company and organizational scope. IDs are administrative references, not authority inferred from job title.</p><div className="grid gap-3 sm:grid-cols-2">{[["companyId", "Company ID", data.actor.companyId || ""], ["userId", "ERP user ID", ""], ["divisionId", "Division ID (optional)", ""], ["departmentId", "Department ID (optional)", ""]].map(([key, label, initial]) => <label key={key} className="text-sm">{label}<Input name={String(key)} type="number" min="1" required={key === "companyId" || key === "userId"} defaultValue={initial} /></label>)}<label className="text-sm">Authority<select name="tier" className="block w-full rounded-md border bg-background p-2">{TIERS.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}</select></label><label className="text-sm">Valid from<Input required name="startsAt" type="datetime-local" /></label></div><label className="block text-sm">Assignment reason<Textarea name="reason" required minLength={10} /></label><Button disabled={busy}>{busy ? "Saving…" : "Save assignment"}</Button></form>}
    </>}
  </section>;
}
function Matrix({ rules }: { rules: AuthorityRule[] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-muted/50"><tr>{["Category", "DH", "GM", "CFO", "CEO / Owner", "COA mappings"].map(h => <th key={h} className="p-2 text-xs font-medium">{h}</th>)}</tr></thead><tbody>{rules.map(rule => <tr key={rule.code} className="border-t"><td className="p-2">{rule.name}</td><td className="p-2">{money(rule.departmentHead)}</td><td className="p-2">{money(rule.generalManager)}</td><td className="p-2">{money(rule.cfo)}</td><td className="p-2">Above CFO</td><td className="p-2">{rule.coaIds.length ? rule.coaIds.join(", ") : "Unmapped"}</td></tr>)}</tbody></table></div>;
}
