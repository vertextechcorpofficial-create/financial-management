"use client";

import { useId, useMemo, useState } from "react";
import { Calculator, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PROPOSED_RULES } from "../policy-seed";
import { TIER_LABELS } from "../types";
import { quickAuthorityCalculation } from "../domain/quickAuthorityCalculation";

export function QuickAuthorityChecker() {
  const categoryInputId = useId();
  const amountInputId = useId();
  const [categoryId, setCategoryId] = useState("OFFICE_SUPPLIES");
  const [amount, setAmount] = useState("35000.00");
  const [categorySearch, setCategorySearch] = useState("");
  const outcome = useMemo(() => quickAuthorityCalculation(categoryId, amount), [categoryId, amount]);
  const category = PROPOSED_RULES.find(rule => rule.code === categoryId);
  const categories = PROPOSED_RULES.filter(rule => rule.name.toLowerCase().includes(categorySearch.trim().toLowerCase()));
  return <Card className="overflow-hidden">
    <CardHeader className="border-b bg-muted/15"><div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-1"><CardTitle className="flex items-center gap-2"><Calculator className="size-5 text-primary" />Quick authority checker</CardTitle><CardDescription>Find the minimum monetary authority from the proposed reference matrix. No saved policy is required.</CardDescription></div><Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300">Simulation only · proposed memo</Badge></div></CardHeader>
    <CardContent className="space-y-5 p-4 sm:p-6">
      <div className="grid gap-5 md:grid-cols-2">
        <label htmlFor={categoryInputId} className="flex flex-col gap-2 text-sm font-medium">Expense category
          <Input aria-label="Search expense categories" placeholder="Search categories…" value={categorySearch} onChange={event => setCategorySearch(event.target.value)} />
          <select id={categoryInputId} aria-label="Expense category" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={categoryId} onChange={event => setCategoryId(event.target.value)}>
            <option value="">Choose a category…</option>{categories.map(rule => <option key={rule.code} value={rule.code}>{rule.name}</option>)}
          </select>
          {category && <span className="text-xs font-normal text-muted-foreground">Proposed source matrix · memo page {category.page}</span>}
          {categoryId && !categories.some(rule => rule.code === categoryId) && <span className="text-xs font-normal text-muted-foreground">Selected: {category?.name}. Clear search to choose a different category.</span>}
        </label>
        <label htmlFor={amountInputId} className="flex flex-col gap-2 text-sm font-medium">Requested amount (₱)
          <Input id={amountInputId} aria-label="Requested amount in Philippine pesos" inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} placeholder="e.g. 35000.00" aria-describedby={`${amountInputId}-help`} aria-invalid={amount.length > 0 && !outcome.ok} />
          <span id={`${amountInputId}-help`} className="text-xs font-normal text-muted-foreground">Positive PHP amount; up to two decimal places. Enter without commas. The prefilled value is an example only.</span>
        </label>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {!outcome.ok ? <div role="status" className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">{outcome.error}</div> : <div className="rounded-xl border bg-primary/[0.025] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Required minimum authority</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{TIER_LABELS[outcome.result.requiredTier]}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{category?.name}: {outcome.result.explanation}</p>
        </div>}
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" /><p><strong className="text-foreground">Reference calculator only.</strong> This uses the proposed memo limits, not an active company policy. It does not verify budget, documents, delegation, requester identity, or actual approver authorization. It does not save, approve, or route an expense.</p></div>
    </CardContent>
  </Card>;
}
