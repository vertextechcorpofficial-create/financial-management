"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { OperationsExpense } from "../operationsTypes";
import type { DummyAction, DummyCommand } from "../domain/dummyWorkflow";

export function DummyExpenseActions({ expense, onSaved }: { expense: OperationsExpense; onSaved: () => void }) {
  const [reason, setReason] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [action, setAction] = useState<DummyAction | null>(null);
  const [review, setReview] = useState<NonNullable<DummyCommand["review"]>>({ department: expense.departmentName || "", evidence: "", quotations: "NOT_REQUIRED", documentsChecked: false, companyChecked: false, categoryChecked: false, specialRulesChecked: false });
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const capability = expense.dummyActions;
  const submit = async () => {
    if (!action) return;
    setBusy(true); setError("");
    const value = { requestId: expense.id, expectedRevision: expense.revision, action, reason, ...(action === "APPROVE" ? { review } : {}) }, signature = JSON.stringify(value);
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/fm/treasury/expenses-v2/expense-approval-workflow/requests/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...value, requestKey: pending.current.key }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      pending.current = null; onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Action unconfirmed. Retry the same intent."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4 rounded-lg border p-4">
    <h3 className="font-semibold">Review and decision</h3>
    {!capability?.finance && !capability?.decide && <p className="text-sm">{capability?.blocker || "Verified decision capability unavailable."}</p>}
    {capability?.decide && <div className="space-y-3">
      <p className="text-sm">Review the expense amount, attachments, special requirements and company before approving. Return or reject with a reason if requirements are not satisfied.</p>
      <label className="block space-y-1 text-sm">Review findings (optional)<Textarea maxLength={2000} disabled={busy} value={review.evidence} onChange={e => setReview({ ...review, evidence: e.target.value })} /></label>
      <label className="block space-y-1 text-sm">Purchase quotation finding<select className="h-10 w-full rounded-md border bg-background px-3" disabled={busy} value={review.quotations} onChange={e => setReview({ ...review, quotations: e.target.value as typeof review.quotations })}><option value="NOT_REQUIRED">Not required for this request · reviewer determination</option><option value="THREE_CHECKED">Three distinct supplier quotations checked</option><option value="EXCEPTION_CHECKED">Documented permitted exception checked</option></select></label>
      {([["companyChecked", "Company and supporting evidence reviewed"], ["categoryChecked", "Expense category reviewed"], ["documentsChecked", "Supporting documents reviewed"], ["specialRulesChecked", "Applicable special requirements reviewed"]] as const).map(([key, label]) => <label key={key} className="flex gap-2 text-sm"><input type="checkbox" disabled={busy} checked={review[key]} onChange={e => setReview({ ...review, [key]: e.target.checked })} />{label}</label>)}
    </div>}
    <div className="flex flex-wrap gap-2">
      {([ ["APPROVE", "Approve"], ["REJECT", "Reject"], ["RETURN", "Return with concern"] ] as const).map(([key, label]) => <Button key={key} variant={key === "APPROVE" ? "default" : "outline"} disabled={busy || !capability?.decide} onClick={() => setAction(key)}>{label}</Button>)}
    </div>
    {action && <form className="space-y-3 rounded border p-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <p className="text-sm font-medium">Confirm {action.replaceAll("_", " ")} · revision {expense.revision}</p>
      <label className="block space-y-1 text-sm">Reason (required)<Textarea required minLength={5} maxLength={2000} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="flex gap-2"><Button disabled={busy}>{busy ? "Saving…" : "Confirm decision"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setAction(null)}>Cancel</Button></div>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error} Refresh details if this request changed; no success is assumed.</p>}
  </section>;
}
