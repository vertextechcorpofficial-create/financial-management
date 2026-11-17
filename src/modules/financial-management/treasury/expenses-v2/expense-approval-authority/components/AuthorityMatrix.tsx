"use client";

import { useState } from "react";
import { Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { AuthorityPolicy, AuthorityRule } from "../types";
import type { WorkspaceCommand } from "../domain/workspace";
import { PROPOSED_RULES } from "../policy-seed";
import { Field, Notice, ReferencePicker, money, selectClass } from "./shared";

export function AuthorityMatrix({ policy, policies, canEdit, busy, command }: {
  policy: AuthorityPolicy | null; policies: AuthorityPolicy[]; canEdit: boolean; busy: boolean;
  command: (value: WorkspaceCommand) => Promise<void>;
}) {
  const [rules, setRules] = useState<AuthorityRule[]>(structuredClone(policy?.rules || PROPOSED_RULES));
  const [name, setName] = useState(policy?.name || "Proposed memo reference"), [search, setSearch] = useState("");
  const [compareId, setCompareId] = useState(""), [reason, setReason] = useState(""), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false), [mappingCategory, setMappingCategory] = useState("OFFICE_SUPPLIES"), [mappingCoa, setMappingCoa] = useState<number | null>(null);
  const [mappingTexts, setMappingTexts] = useState<Record<string, string>>(Object.fromEntries((policy?.rules || PROPOSED_RULES).map(r => [r.code, r.coaIds.join(", ")])));
  const editable = canEdit && policy?.status === "DRAFT";
  const compare = policies.find(p => p.id === compareId);
  const update = (code: string, field: "departmentHead" | "generalManager" | "cfo", value: string) => {
    setRules(rows => rows.map(row => row.code === code ? { ...row, [field]: value } : row)); setSaved(false);
  };
  return <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><CardTitle>Authority matrix</CardTitle><CardDescription>PHP ceilings · continuous centavo bands · minimum authority, not an approval chain</CardDescription></div>
    <div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Search policy categories" className="pl-8" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a category…" /></div>
      <select className={`${selectClass} w-48`} aria-label="Compare policy version" value={compareId} onChange={e => setCompareId(e.target.value)}><option value="">Compare version…</option>{policies.filter(p => p.id !== policy?.id && p.companyId === policy?.companyId).map(p => <option key={p.id} value={p.id}>v{p.version} · {p.name}</option>)}</select></div></div></CardHeader>
    <CardContent className="space-y-4">
      {!policy && <Notice>Source reference only. Create a company-scoped draft to edit or evaluate these proposed rules.</Notice>}
      {editable && <Field label="Draft name"><Input value={name} maxLength={150} onChange={e => setName(e.target.value)} /></Field>}
      <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[880px] text-sm"><caption className="sr-only">All 25 expense categories and authority ceilings. Changed values show previous version below.</caption>
        <thead className="bg-muted/60 text-xs text-muted-foreground"><tr>{["Expense category", "Department Head ≤", "General Manager ≤", "CFO ≤", "CEO / Owner", "COA mapping"].map(h => <th key={h} scope="col" className="px-3 py-3 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y">{rules.filter(r => r.name.toLowerCase().includes(search.toLowerCase())).map(rule => <tr key={rule.code} className="hover:bg-muted/20"><th scope="row" className="max-w-60 px-3 py-3 text-left font-medium"><div>{rule.name}</div><span className="text-[10px] font-normal text-muted-foreground">MEMO P.{rule.page}</span></th>
          {(["departmentHead", "generalManager", "cfo"] as const).map(field => {
            const old = compare?.rules.find(r => r.code === rule.code)?.[field], changed = compare && old !== rule[field];
            return <td key={field} className={`px-3 py-3 tabular-nums ${changed ? "bg-amber-500/5" : ""}`}>{editable && rule[field] !== null ? <Input className="min-w-28" inputMode="decimal" aria-label={`${rule.name} ${field} ceiling`} value={rule[field] || ""} onChange={e => update(rule.code, field, e.target.value)} /> : money(rule[field])}
              {changed && <div className="mt-1 text-xs text-muted-foreground">Was {money(old ?? null)}</div>}</td>;
          })}<td className="px-3 py-3 tabular-nums">Above {money(rule.cfo)}</td><td className="max-w-44 px-3 py-3">{editable ? <Input aria-label={`${rule.name} COA IDs, comma separated`} placeholder="COA IDs: 12, 34" value={mappingTexts[rule.code] || ""} onChange={e => { const text = e.target.value; setMappingTexts(previous => ({ ...previous, [rule.code]: text })); setRules(rows => rows.map(r => r.code === rule.code ? { ...r, coaIds: text.trim() ? text.split(",").map(v => Number(v.trim())) : [] } : r)); setSaved(false); }} /> : rule.coaIds.length ? rule.coaIds.join(", ") : <span className="text-xs text-muted-foreground">Not mapped</span>}</td></tr>)}</tbody></table></div>
      {editable && <form className="space-y-3" onSubmit={async e => { e.preventDefault(); setError(""); try { await command({ action: "UPDATE_POLICY", id: policy.id, name, rules, reason }); setSaved(true); } catch (err) { setError((err as Error).message); } }}>
        <Button type="button" variant="outline" size="sm" aria-expanded={mappingOpen} onClick={() => setMappingOpen(v => !v)}>{mappingOpen ? "Hide" : "Open"} COA mapping helper</Button>
        {mappingOpen && <div className="grid items-end gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"><Field label="Map to category"><select className={selectClass} value={mappingCategory} onChange={e => setMappingCategory(e.target.value)}>{rules.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}</select></Field><ReferencePicker label="Chart of account" kind="coas" value={mappingCoa} onChange={setMappingCoa} /><Button type="button" variant="outline" disabled={!mappingCoa || busy} onClick={() => {
          if (!mappingCoa) return;
          const existing = rules.find(r => r.code !== mappingCategory && r.coaIds.includes(mappingCoa));
          if (existing) { setError(`This COA is already mapped to ${existing.name}. Remove that mapping first.`); return; }
          setRules(rows => rows.map(r => r.code === mappingCategory ? { ...r, coaIds: [...new Set([...r.coaIds, mappingCoa])] } : r));
          setMappingTexts(previous => ({ ...previous, [mappingCategory]: [...new Set([...(rules.find(r => r.code === mappingCategory)?.coaIds || []), mappingCoa])].join(", ") }));
          setSaved(false); setError("");
        }}>Add mapping to draft</Button></div>}
        <Field label="Reason for this revision" hint="All 25 rules are validated and saved together. COA mappings are verified against Directus and cannot overlap."><Textarea value={reason} minLength={5} maxLength={2000} required onChange={e => setReason(e.target.value)} /></Field>
        <Button disabled={busy || name.trim().length < 3}><Save />{busy ? "Saving…" : "Save draft revision"}</Button>
      </form>}{error && <Notice danger>{error}</Notice>}{saved && <p role="status" className="text-sm text-emerald-700">Draft revision saved.</p>}
    </CardContent></Card>;
}
