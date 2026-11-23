"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OperationsData, OperationsExpense, OperationsLog } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/operationsTypes";
import { requesterName } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/reviewProjection";
import { DummyExpenseActions } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/workspaces/DummyExpenseActions";
import { SpecialExpenseSummary } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/workspaces/SpecialExpenseFields";
import { ExpenseStatus, expenseAmount } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/workspaces/ExpenseStatus";
import { AuthorityView } from "../_components/AuthorityView";
import { operationsApi } from "../_components/views";

export function ApprovalsView() {
  return <AuthorityView view="my-approvals">{(data, refresh) => <ApprovalQueue data={data} refresh={refresh} />}</AuthorityView>;
}

function ApprovalQueue({ data, refresh }: { data: OperationsData; refresh: () => void }) {
  const pending = data.assignedExpenses ?? [];
  const history = data.decidedExpenses ?? [];
  const [tab, setTab] = useState<"pending" | "history">(pending.length || !history.length ? "pending" : "history");
  const [selected, setSelected] = useState<string | null>(null);
  const rows = tab === "pending" ? pending : history;

  return <>
    {data.decisionHistoryAvailable === false && <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">Decision history is temporarily unavailable.</p>}
    <nav aria-label="Approval queue" className="flex flex-wrap gap-2">
      <Button variant={tab === "pending" ? "secondary" : "ghost"} aria-pressed={tab === "pending"} onClick={() => setTab("pending")}>Pending Decision ({pending.length})</Button>
      <Button variant={tab === "history" ? "secondary" : "ghost"} aria-pressed={tab === "history"} onClick={() => setTab("history")}>Decision History ({history.length})</Button>
    </nav>
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-muted/50"><tr>{["Request", "Requester", "Category", "Amount", "Authority", "Expense date", "Status", "Actions"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className="border-t hover:bg-muted/40">
          <td className="break-all p-3 font-medium">{row.doc_no}</td><td className="p-3">{requesterName(row)}</td><td className="p-3">{row.categoryName}</td>
          <td className="whitespace-nowrap p-3 font-semibold tabular-nums">{expenseAmount(row.amount)}</td><td className="p-3">{row.requiredAuthority || "—"}</td>
          <td className="p-3">{row.independentSnapshot?.expenseDate}</td><td className="p-3"><ExpenseStatus value={row.status} /></td>
          <td className="p-3"><Button size="sm" variant="outline" onClick={() => setSelected(String(row.id))}><Eye aria-hidden="true" />View details</Button></td>
        </tr>)}{!rows.length && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No requests have a verified assignment to you.</td></tr>}</tbody>
      </table>
    </div>
    {selected && <ReviewDialog key={selected} id={selected} close={() => setSelected(null)} onSaved={() => { setSelected(null); refresh(); }} />}
  </>;
}

function ReviewDialog({ id, close, onSaved }: { id: string; close: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<{ expense: OperationsExpense; logs: OperationsLog[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${operationsApi}?expenseId=${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Unable to load request.");
        if (!controller.signal.aborted) setDetail(result.data);
      })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id]);
  const expense = detail?.expense;
  const snapshot = expense?.independentSnapshot;
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader><DialogTitle>Expense review · {expense?.doc_no || id}</DialogTitle><DialogDescription>Review the supporting evidence before deciding. Requesters cannot approve their own requests.</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {!detail && !error && <p role="status">Loading request…</p>}
      {detail && expense && snapshot && <div className="space-y-5">
        <section className="space-y-4 rounded-xl border bg-primary/5 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-2xl font-semibold tabular-nums">{expenseAmount(snapshot.amount)}</p><ExpenseStatus value={expense.status} /></div>
          <dl className="grid gap-3 sm:grid-cols-2">{[["Requester", requesterName(expense)], ["Company", snapshot.requestedCompany], ["Department", snapshot.department], ["Category", expense.categoryName], ["Payee", snapshot.payee], ["Expense date", snapshot.expenseDate], ["Required authority", expense.requiredAuthority], ["Revision", expense.revision]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value || "—"}</dd></div>)}</dl>
          <p className="whitespace-pre-wrap border-t pt-3"><strong>Purpose: </strong>{snapshot.purpose}</p>
        </section>
        <SpecialExpenseSummary category={snapshot.category} value={snapshot.specialDetails} attachments={snapshot.attachments} />
        <section className="space-y-2"><h3 className="font-semibold">Supporting documents</h3>{snapshot.attachments.map((file, index) => <Button key={file.id} asChild variant="outline"><a href={`${operationsApi}?expenseId=${encodeURIComponent(id)}&documentIndex=${index}`} target="_blank" rel="noopener noreferrer">{file.name}</a></Button>)}</section>
        <DummyExpenseActions key={`${expense.id}:${expense.revision}`} expense={expense} onSaved={onSaved} />
        {snapshot.dummyReview && <details className="rounded-lg border p-3 text-sm"><summary>Recorded review findings</summary><p className="mt-2 whitespace-pre-wrap">{snapshot.dummyReview.evidence}</p><p>Reviewer #{snapshot.dummyReview.reviewerId}</p></details>}
        <section className="space-y-3"><h3 className="font-semibold">Request history</h3><ol className="space-y-3 border-s-2 border-primary/20 ps-4">{detail.logs.map(log => <li key={log.id} className="space-y-2 rounded-lg border bg-card p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><ExpenseStatus value={log.action} /><time dateTime={log.created_at} className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} Manila</time></div><p className="whitespace-pre-wrap">{log.remarks}</p></li>)}</ol></section>
      </div>}
    </DialogContent>
  </Dialog>;
}
