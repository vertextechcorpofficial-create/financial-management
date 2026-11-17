"use client";

import { useRef, useState } from "react";
import { Calculator, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TIER_LABELS, type AuthorityPolicy, type EvaluationResult } from "../types";
import { authorityApi, AuthorityApiError } from "../services/authorityApi";
import { Empty, Field, Notice, ReferencePicker, Status, money, selectClass } from "./shared";
import { QuickAuthorityChecker } from "./QuickAuthorityChecker";

export function PolicyEvaluationPanel({ policy, revision, refresh }: { policy: AuthorityPolicy | null; revision: number; refresh: () => Promise<unknown> }) {
  const [checkerMode, setCheckerMode] = useState<"quick" | "full">("quick");
  const [mode, setMode] = useState<"simulation" | "existing">("simulation"), [category, setCategory] = useState("OFFICE_SUPPLIES"), [amount, setAmount] = useState("35000.00");
  const [divisionId, setDivisionId] = useState<number | null>(null), [departmentId, setDepartmentId] = useState<number | null>(null), [coaId, setCoaId] = useState<number | null>(null), [expenseId, setExpenseId] = useState<number | null>(null);
  const [result, setResult] = useState<EvaluationResult | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [savedId, setSavedId] = useState("");
  const pending = useRef<{ signature: string; body: unknown } | null>(null);
  const run = async (save: boolean) => {
    if (!policy) return;
    setBusy(true); setError(""); setSavedId("");
    const fields = { policyId: policy.id, expenseId: mode === "existing" ? expenseId : null,
      ...(mode === "simulation" ? { categoryCode: category, amount, divisionId, departmentId, coaId } : {}) };
    const signature = JSON.stringify({ ...fields, save, revision });
    if (pending.current?.signature !== signature) pending.current = { signature, body: { ...fields, save, expectedRevision: revision, requestId: crypto.randomUUID() } };
    try {
      if (mode === "existing" && !expenseId) throw new Error("Select an expense.");
      const data = await authorityApi<{ result: EvaluationResult; evaluationId?: string }>("evaluate", pending.current.body);
      setResult(data.result); pending.current = null;
      if (data.evaluationId) { setSavedId(data.evaluationId); await refresh().catch(() => setError("Evaluation saved, but the workspace refresh failed. Refresh before saving another evaluation.")); }
    } catch (err) {
      if (err instanceof AuthorityApiError && err.status < 500) pending.current = null;
      setError((err as Error).message);
    } finally { setBusy(false); }
  };
  return <div className="space-y-5"><div><h2 className="text-lg font-semibold">Evaluate policy</h2><p className="text-sm text-muted-foreground">Find the proposed monetary authority or run the full persisted-policy assessment.</p></div>
    <div role="group" aria-label="Evaluation mode" className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1"><button type="button" aria-pressed={checkerMode === "quick"} onClick={() => setCheckerMode("quick")} className={`rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${checkerMode === "quick" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Quick authority checker</button><button type="button" aria-pressed={checkerMode === "full"} onClick={() => setCheckerMode("full")} className={`rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${checkerMode === "full" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Full policy evaluation</button></div>
    {checkerMode === "quick" ? <QuickAuthorityChecker /> : !policy ? <Empty title="Create a policy draft first">Full policy evaluation uses a specific persisted company policy version. The proposed memo matrix is not an active company policy.</Empty> : <div className="grid items-start gap-5 xl:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.3fr)]"><Card><CardHeader><CardTitle>Evaluate policy</CardTitle><CardDescription>A reproducible policy check. Never an expense approval.</CardDescription></CardHeader><CardContent className="space-y-4">
    <Notice>Simulation inputs are hypothetical. Existing-expense mode reads financial fields from Directus and requires a verified COA mapping.</Notice>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(false); }} onChange={() => { setResult(null); setSavedId(""); }}>
      <Field label="Evaluation mode"><select className={selectClass} value={mode} onChange={e => { setMode(e.target.value as "simulation" | "existing"); setResult(null); }}><option value="simulation">Hypothetical simulation</option><option value="existing">Existing expense (server-verified fields)</option></select></Field>
      {mode === "simulation" ? <><Field label="Expense category"><select className={selectClass} value={category} onChange={e => setCategory(e.target.value)}>{policy.rules.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}</select></Field>
        <Field label="Amount (PHP)"><Input inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="35000.00" /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><ReferencePicker label="Division" kind="divisions" value={divisionId} onChange={id => { setDivisionId(id); setDepartmentId(null); }} /><ReferencePicker label="Department" kind="departments" value={departmentId} onChange={setDepartmentId} /></div>
        <ReferencePicker label="Chart of account" kind="coas" value={coaId} onChange={setCoaId} />
      </> : <ReferencePicker label="Expense" kind="expenses" companyId={policy.companyId} value={expenseId} onChange={setExpenseId} required />}
      <div className="flex flex-wrap gap-2"><Button disabled={busy}><Calculator />{busy ? "Evaluating…" : "Preview checks"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void run(true)}><Save />Evaluate & save</Button></div>
    </form>{error && <Notice danger>{error}</Notice>}{savedId && <p role="status" className="text-sm text-emerald-700">Evaluation saved as {savedId}. Review findings were added to Exceptions.</p>}
  </CardContent></Card><div aria-live="polite">{result ? <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Evaluation result</CardTitle><Status value={result.decision} /></div><CardDescription>{result.mode.replaceAll("_", " ")} · {new Date(result.evaluatedAt).toLocaleString()}</CardDescription></CardHeader><CardContent className="space-y-5">
    <div className="rounded-lg border bg-muted/30 p-5"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Minimum monetary authority</p><p className="mt-2 text-2xl font-semibold tracking-tight">{TIER_LABELS[result.requiredAuthorityTier]}</p><p className="mt-1 text-sm text-muted-foreground">{money(result.amount)} · {policy.rules.find(r => r.code === result.categoryCode)?.name}</p><p className="mt-3 text-xs">Eligible candidate IDs: {result.candidateApproverIds.join(", ") || "None verified"}</p></div>
    <Notice><span className="font-medium">No operational approval performed.</span> Existing expense status, budgets, and disbursements are untouched.</Notice>
    <ul className="divide-y">{result.checks.map(check => <li key={check.code} className="flex items-start gap-3 py-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold tracking-wide">{check.code.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-muted-foreground">{check.message}</p></div><Status value={check.status} /></li>)}</ul>
  </CardContent></Card> : <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center"><ShieldAlert className="mb-4 size-10 text-muted-foreground/50" /><h3 className="font-semibold">Authority is not budget clearance</h3><p className="mt-2 max-w-sm text-sm text-muted-foreground">Run a preview to see the required authority, evidence gaps, and independent budget checks.</p></div>}</div></div>}</div>;
}
